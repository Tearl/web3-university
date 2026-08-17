import { createPublicClient, decodeEventLog, getAddress, http, type Hash } from "viem";
import { courseMarketAbi } from "@web3-university/shared";
import { config } from "./config.js";
import type { CourseSubmissionVerifier } from "./types.js";

export function createCourseSubmissionVerifier(): CourseSubmissionVerifier {
  const client = createPublicClient({ transport: http(config.RPC_URL) });
  return {
    async verify(transactionHash) {
      const receipt = await client.getTransactionReceipt({ hash: transactionHash as Hash });
      if (receipt.status !== "success") throw new Error("transaction_reverted");
      for (const log of receipt.logs) {
        if (getAddress(log.address) !== config.COURSE_MARKET_ADDRESS) continue;
        try {
          const decoded = decodeEventLog({ abi: courseMarketAbi, data: log.data, topics: log.topics });
          if (decoded.eventName !== "CourseSubmitted") continue;
          const args = decoded.args as unknown as { courseId: bigint; teacher: `0x${string}`; priceYD: bigint; metadataURI: string };
          return { courseId: args.courseId, teacher: getAddress(args.teacher), priceYD: args.priceYD, metadataUri: args.metadataURI };
        } catch {
          // Ignore unrelated logs from the same transaction.
        }
      }
      throw new Error("course_submitted_event_missing");
    },
  };
}
