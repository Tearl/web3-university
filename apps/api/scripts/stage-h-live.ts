import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http, parseAbi } from "viem";
import { config } from "../src/config.js";

type HealthResponse = {
  status?: string;
  features?: Record<string, boolean>;
};

type CatalogResponse = {
  courses?: Array<{ courseId: string; status: number; partial: boolean }>;
  source?: string;
  degraded?: boolean;
  index?: { indexedBlock: string | null; chainHeadBlock: string; lagBlocks: string | null; caughtUp: boolean; hasIndexingErrors: boolean } | null;
};

type SubgraphResponse = {
  errors?: Array<{ message: string }>;
  data?: {
    courses: Array<{ courseId: string; status: number }>;
    purchases: Array<{ course: { courseId: string }; transactionHash: string }>;
    certificates: Array<{ tokenId: string; course: { courseId: string }; tokenURI: string; transactionHash: string }>;
    _meta: { block: { number: number }; hasIndexingErrors: boolean };
  };
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Stage H live acceptance`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${new URL(url).pathname || "/"} returned HTTP ${response.status}`);
  return await response.json() as T;
}

const student = getAddress(required("STUDENT_ADDRESS"));
const apiUrl = (process.env.E2E_API_URL?.trim() || config.PUBLIC_API_URL).replace(/\/$/, "");
const subgraphUrl = required("SUBGRAPH_URL");
const client = createPublicClient({ transport: http(config.RPC_URL) });
const chainId = await client.getChainId();
assert(chainId === 11155111, `Expected Sepolia chainId 11155111, received ${chainId}`);

const dexManifestPath = fileURLToPath(new URL("../../../packages/contracts/deployments/sepolia-dex.json", import.meta.url));
const dex = JSON.parse(await readFile(dexManifestPath, "utf8")) as {
  ownedContracts: Record<string, { address: `0x${string}` }>;
  pools: Array<{ address: `0x${string}` }>;
};
const ownedAddresses = {
  ydToken: config.YD_TOKEN_ADDRESS,
  courseMarket: config.COURSE_MARKET_ADDRESS,
  certificate: config.COURSE_CERTIFICATE_ADDRESS,
  completionOracle: config.COMPLETION_ORACLE_ADDRESS,
  ...Object.fromEntries(Object.entries(dex.ownedContracts).map(([name, value]) => [name, getAddress(value.address)])),
  ...Object.fromEntries(dex.pools.map((pool, index) => [`uniswapPool${index + 1}`, getAddress(pool.address)])),
};

await Promise.all(Object.entries(ownedAddresses).map(async ([name, address]) => {
  const bytecode = await client.getBytecode({ address: address as `0x${string}` });
  assert(bytecode && bytecode !== "0x", `${name} has no Sepolia bytecode`);
}));

const marketAbi = parseAbi(["function hasPurchased(address student, uint256 courseId) view returns (bool)"]);
const certificateAbi = parseAbi([
  "function certificateOf(address student, uint256 courseId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
const purchased = await client.readContract({
  address: config.COURSE_MARKET_ADDRESS,
  abi: marketAbi,
  functionName: "hasPurchased",
  args: [student, 1n],
});
assert(purchased, "Stage H student has not purchased course 1");
const tokenId = await client.readContract({
  address: config.COURSE_CERTIFICATE_ADDRESS,
  abi: certificateAbi,
  functionName: "certificateOf",
  args: [student, 1n],
});
assert(tokenId > 0n, "Stage H student has no certificate for course 1");
const tokenURI = await client.readContract({
  address: config.COURSE_CERTIFICATE_ADDRESS,
  abi: certificateAbi,
  functionName: "tokenURI",
  args: [tokenId],
});
assert(tokenURI.startsWith("https://") || tokenURI.startsWith("ipfs://"), "Certificate tokenURI is not publicly addressable");

const [health, catalog] = await Promise.all([
  fetchJson<HealthResponse>(`${apiUrl}/health`),
  fetchJson<CatalogResponse>(`${apiUrl}/courses`),
]);
assert(health.status === "ok", "Public API health status is not ok");
for (const feature of ["database", "privy", "privyAppIdsMatch", "fallbackOracle", "subgraph"] as const) {
  assert(health.features?.[feature] === true, `Public API feature ${feature} is not ready`);
}
assert(catalog.source === "subgraph" && catalog.degraded === false, "Public catalog is not using the healthy Subgraph path");
assert(catalog.index?.caughtUp === true && catalog.index.hasIndexingErrors === false, "Subgraph index is behind or has errors");
assert(catalog.courses?.some((course) => course.courseId === "1" && course.status === 1 && !course.partial), "Active course 1 is missing or partial");

const query = `query StageH($wallet: Bytes!) {
  courses(where: { courseId: "1" }) { courseId status }
  purchases(where: { buyer: $wallet, course_: { courseId: "1" } }) { course { courseId } transactionHash }
  certificates(where: { student: $wallet, course_: { courseId: "1" } }) { tokenId course { courseId } tokenURI transactionHash }
  _meta { block { number } hasIndexingErrors }
}`;
const indexed = await fetchJson<SubgraphResponse>(subgraphUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query, variables: { wallet: student.toLowerCase() } }),
});
assert(!indexed.errors?.length && indexed.data, "Subgraph Stage H query returned errors");
assert(indexed.data.courses.some((course) => course.courseId === "1" && course.status === 1), "Subgraph is missing active course 1");
assert(indexed.data.purchases.length > 0, "Subgraph is missing the student's course 1 purchase");
assert(indexed.data.certificates.some((certificate) => BigInt(certificate.tokenId) === tokenId), "Subgraph certificate does not match on-chain certificateOf");
assert(indexed.data._meta.hasIndexingErrors === false, "Subgraph reports indexing errors");

console.log(JSON.stringify({
  status: "ready",
  chainId,
  contractsWithCode: Object.keys(ownedAddresses),
  course: { courseId: "1", purchased: true },
  certificate: { tokenId: tokenId.toString(), tokenURI },
  api: { url: apiUrl, features: health.features },
  subgraph: {
    indexedBlock: indexed.data._meta.block.number,
    chainHeadBlock: catalog.index?.chainHeadBlock,
    lagBlocks: catalog.index?.lagBlocks,
    hasIndexingErrors: false,
  },
}, null, 2));
