import { createPublicClient, http, parseAbi } from "viem";
import { config } from "./config.js";
import type { PurchaseVerifier } from "./types.js";

export function createPurchaseVerifier(): PurchaseVerifier {
  const client = createPublicClient({ transport: http(config.RPC_URL) });
  const purchaseAbi = parseAbi(["function hasPurchased(address student, uint256 courseId) view returns (bool)"]);

  return {
    async hasPurchased(wallet, courseId) {
      return client.readContract({
        address: config.COURSE_MARKET_ADDRESS,
        abi: purchaseAbi,
        functionName: "hasPurchased",
        args: [wallet, courseId],
      }) as Promise<boolean>;
    },
  };
}
