import { createPublicClient, createWalletClient, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import type { OracleChainService } from "./types.js";

const certificateAbi = parseAbi([
  "function certificateOf(address student, uint256 courseId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
const oracleAbi = parseAbi([
  "function requests(uint256 requestId) view returns (address student, uint256 courseId, bool fulfilled)",
  "function requestStatuses(uint256 requestId) view returns (uint8)",
  "function fulfillCompletion(uint256 requestId, bool completed, string evidenceHash, string tokenURI)",
]);

export function createOracleChainService(): OracleChainService {
  const transport = http(config.RPC_URL);
  const publicClient = createPublicClient({ transport });
  const account = privateKeyToAccount(config.LOCAL_ORACLE_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, transport });

  return {
    async getCertificate(wallet, courseId) {
      const tokenId = await publicClient.readContract({
        address: config.COURSE_CERTIFICATE_ADDRESS, abi: certificateAbi,
        functionName: "certificateOf", args: [wallet, courseId],
      });
      if (tokenId === 0n) return null;
      const tokenUri = await publicClient.readContract({
        address: config.COURSE_CERTIFICATE_ADDRESS, abi: certificateAbi,
        functionName: "tokenURI", args: [tokenId],
      });
      return { tokenId, tokenUri };
    },

    async getRequest(requestId) {
      const [[student, courseId, fulfilled], status] = await Promise.all([
        publicClient.readContract({
          address: config.COMPLETION_ORACLE_ADDRESS, abi: oracleAbi,
          functionName: "requests", args: [requestId],
        }),
        publicClient.readContract({
          address: config.COMPLETION_ORACLE_ADDRESS, abi: oracleAbi,
          functionName: "requestStatuses", args: [requestId],
        }),
      ]);
      if (student === "0x0000000000000000000000000000000000000000") return null;
      return { student: getAddress(student), courseId, fulfilled, status };
    },

    async fulfill(input) {
      if (config.NODE_ENV !== "development" || config.CHAIN_ID !== 31337) throw new Error("local_fulfillment_disabled");
      const { request } = await publicClient.simulateContract({
        account, address: config.COMPLETION_ORACLE_ADDRESS, abi: oracleAbi,
        functionName: "fulfillCompletion", args: [input.requestId, true, input.evidenceHash, input.tokenUri],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("fulfillment_reverted");
      return hash;
    },
  };
}
