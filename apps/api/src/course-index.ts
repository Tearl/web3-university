import { createPublicClient, getAddress, http, parseAbi, zeroHash } from "viem";
import { config } from "./config.js";
import type {
  ChainCourseRecord,
  CourseIndex,
  IndexedCertificateRecord,
  IndexedPurchaseRecord,
  IndexSyncStatus,
} from "./types.js";

const courseAbi = parseAbi([
  "function nextCourseId() view returns (uint256)",
  "function courses(uint256) view returns (uint256 id, address teacher, uint256 priceYD, string metadataURI, uint8 status)",
  "function hasPurchased(address student, uint256 courseId) view returns (bool)",
]);
const certificateAbi = parseAbi([
  "function certificateOf(address student, uint256 courseId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

interface GraphCourse {
  courseId: string;
  teacher: string;
  priceYD: string;
  metadataURI: string;
  status: number;
}

interface GraphPurchase {
  id: string;
  course: { courseId: string };
  buyer: string;
  priceYD: string;
  purchasedAt: string;
  transactionHash: string;
}

interface GraphCertificate {
  tokenId: string;
  course: { courseId: string };
  student: string;
  tokenURI: string;
  issuedAt: string;
  transactionHash: string;
}

interface GraphMeta {
  block: { number: number } | null;
  hasIndexingErrors: boolean;
}

function normalizeGraphCourse(course: GraphCourse): ChainCourseRecord {
  return {
    courseId: BigInt(course.courseId),
    teacher: getAddress(course.teacher),
    priceYD: BigInt(course.priceYD),
    metadataUri: course.metadataURI,
    status: course.status,
  };
}

function rpcIndexStatus(chainHeadBlock: bigint): IndexSyncStatus {
  return {
    source: "rpc",
    indexedBlock: null,
    chainHeadBlock,
    lagBlocks: null,
    caughtUp: false,
    hasIndexingErrors: false,
  };
}

export function createCourseIndex(): CourseIndex {
  const client = createPublicClient({ transport: http(config.RPC_URL) });
  async function readRpcCourse(courseId: bigint) {
    const result = await client.readContract({
      address: config.COURSE_MARKET_ADDRESS,
      abi: courseAbi,
      functionName: "courses",
      args: [courseId],
    });
    const [id, teacher, priceYD, metadataUri, status] = result;
    return id === 0n ? null : { courseId: id, teacher, priceYD, metadataUri, status };
  }

  async function graphRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (!config.SUBGRAPH_URL) throw new Error("subgraph_not_configured");
    const response = await fetch(config.SUBGRAPH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("subgraph_unavailable");
    const result = await response.json() as { data?: T; errors?: unknown[] };
    if (result.errors?.length || !result.data) throw new Error("subgraph_invalid_response");
    return result.data;
  }

  async function graphIndexStatus(meta: GraphMeta): Promise<IndexSyncStatus> {
    const chainHeadBlock = await client.getBlockNumber();
    const indexedBlock = meta.block ? BigInt(meta.block.number) : null;
    const lagBlocks = indexedBlock === null || chainHeadBlock < indexedBlock
      ? null
      : chainHeadBlock - indexedBlock;
    return {
      source: "subgraph",
      indexedBlock,
      chainHeadBlock,
      lagBlocks,
      caughtUp: lagBlocks !== null && lagBlocks <= 5n,
      hasIndexingErrors: meta.hasIndexingErrors,
    };
  }

  async function rpcWalletActivity(wallet: `0x${string}`) {
    const [nextCourseId, chainHeadBlock] = await Promise.all([
      client.readContract({
        address: config.COURSE_MARKET_ADDRESS,
        abi: courseAbi,
        functionName: "nextCourseId",
      }),
      client.getBlockNumber(),
    ]);
    const upperBound = nextCourseId > BigInt(config.COURSE_SCAN_LIMIT + 1)
      ? BigInt(config.COURSE_SCAN_LIMIT + 1)
      : nextCourseId;
    const ids = Array.from(
      { length: Number(upperBound - 1n) },
      (_, index) => BigInt(index + 1),
    );
    const purchases: IndexedPurchaseRecord[] = [];
    const certificates: IndexedCertificateRecord[] = [];
    await Promise.all(ids.map(async (courseId) => {
      const [course, purchased, tokenId] = await Promise.all([
        readRpcCourse(courseId),
        client.readContract({
          address: config.COURSE_MARKET_ADDRESS,
          abi: courseAbi,
          functionName: "hasPurchased",
          args: [wallet, courseId],
        }),
        client.readContract({
          address: config.COURSE_CERTIFICATE_ADDRESS,
          abi: certificateAbi,
          functionName: "certificateOf",
          args: [wallet, courseId],
        }),
      ]);
      if (purchased && course) {
        purchases.push({
          id: `rpc-${wallet.toLowerCase()}-${courseId}`,
          courseId,
          buyer: wallet,
          priceYD: course.priceYD,
          purchasedAt: 0n,
          transactionHash: zeroHash,
        });
      }
      if (tokenId > 0n) {
        const tokenUri = await client.readContract({
          address: config.COURSE_CERTIFICATE_ADDRESS,
          abi: certificateAbi,
          functionName: "tokenURI",
          args: [tokenId],
        });
        certificates.push({
          tokenId,
          courseId,
          student: wallet,
          tokenUri,
          issuedAt: 0n,
          transactionHash: zeroHash,
        });
      }
    }));
    purchases.sort((left, right) => Number(left.courseId - right.courseId));
    certificates.sort((left, right) => Number(left.courseId - right.courseId));
    return {
      purchases,
      certificates,
      source: "rpc" as const,
      degraded: true,
      index: rpcIndexStatus(chainHeadBlock),
    };
  }

  return {
    async listActiveCourses() {
      try {
        const data = await graphRequest<{ courses: GraphCourse[]; _meta: GraphMeta }>(
          `query ActiveCourses {
            courses(where: { status: 1 }, orderBy: courseId, orderDirection: asc) {
              courseId teacher priceYD metadataURI status
            }
            _meta { block { number } hasIndexingErrors }
          }`,
          {},
        );
        return {
          courses: data.courses.map(normalizeGraphCourse),
          source: "subgraph",
          degraded: false,
          index: await graphIndexStatus(data._meta),
        };
      } catch {
        const [nextId, chainHeadBlock] = await Promise.all([
          client.readContract({
            address: config.COURSE_MARKET_ADDRESS,
            abi: courseAbi,
            functionName: "nextCourseId",
          }),
          client.getBlockNumber(),
        ]);
        const upperBound = nextId > BigInt(config.COURSE_SCAN_LIMIT + 1)
          ? BigInt(config.COURSE_SCAN_LIMIT + 1)
          : nextId;
        const ids = Array.from(
          { length: Number(upperBound - 1n) },
          (_, index) => BigInt(index + 1),
        );
        const records = await Promise.all(ids.map(readRpcCourse));
        return {
          courses: records.filter((course): course is ChainCourseRecord => course?.status === 1),
          source: "rpc",
          degraded: true,
          index: rpcIndexStatus(chainHeadBlock),
        };
      }
    },

    async findCourse(courseId) {
      try {
        const data = await graphRequest<{ course: GraphCourse | null; _meta: GraphMeta }>(
          `query Course($id: ID!) {
            course(id: $id) { courseId teacher priceYD metadataURI status }
            _meta { block { number } hasIndexingErrors }
          }`,
          { id: courseId.toString() },
        );
        return {
          course: data.course ? normalizeGraphCourse(data.course) : null,
          source: "subgraph",
          degraded: false,
          index: await graphIndexStatus(data._meta),
        };
      } catch {
        const [course, chainHeadBlock] = await Promise.all([
          readRpcCourse(courseId),
          client.getBlockNumber(),
        ]);
        return { course, source: "rpc", degraded: true, index: rpcIndexStatus(chainHeadBlock) };
      }
    },

    async listWalletActivity(wallet) {
      try {
        const data = await graphRequest<{
          purchases: GraphPurchase[];
          certificates: GraphCertificate[];
          _meta: GraphMeta;
        }>(
          `query WalletActivity($wallet: Bytes!) {
            purchases(where: { buyer: $wallet }, orderBy: purchasedAt, orderDirection: desc) {
              id course { courseId } buyer priceYD purchasedAt transactionHash
            }
            certificates(where: { student: $wallet }, orderBy: issuedAt, orderDirection: desc) {
              tokenId course { courseId } student tokenURI issuedAt transactionHash
            }
            _meta { block { number } hasIndexingErrors }
          }`,
          { wallet: wallet.toLowerCase() },
        );
        return {
          purchases: data.purchases.map((purchase) => ({
            id: purchase.id,
            courseId: BigInt(purchase.course.courseId),
            buyer: getAddress(purchase.buyer),
            priceYD: BigInt(purchase.priceYD),
            purchasedAt: BigInt(purchase.purchasedAt),
            transactionHash: purchase.transactionHash as `0x${string}`,
          })),
          certificates: data.certificates.map((certificate) => ({
            tokenId: BigInt(certificate.tokenId),
            courseId: BigInt(certificate.course.courseId),
            student: getAddress(certificate.student),
            tokenUri: certificate.tokenURI,
            issuedAt: BigInt(certificate.issuedAt),
            transactionHash: certificate.transactionHash as `0x${string}`,
          })),
          source: "subgraph",
          degraded: false,
          index: await graphIndexStatus(data._meta),
        };
      } catch {
        return rpcWalletActivity(wallet);
      }
    },
  };
}
