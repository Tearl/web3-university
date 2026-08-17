import { courseMarketAbi } from "@web3-university/shared";
import { createPublicClient, http, keccak256, toBytes } from "viem";
import { config } from "./config.js";
import type { CourseRoleVerifier } from "./types.js";

const teacherRole = keccak256(toBytes("TEACHER_ROLE"));
const reviewerRole = keccak256(toBytes("REVIEWER_ROLE"));

export function createCourseRoleVerifier(): CourseRoleVerifier {
  const client = createPublicClient({ transport: http(config.RPC_URL) });
  return {
    async isTeacher(wallet) {
      return client.readContract({
        abi: courseMarketAbi,
        address: config.COURSE_MARKET_ADDRESS,
        functionName: "hasRole",
        args: [teacherRole, wallet],
      }) as Promise<boolean>;
    },
    async isReviewer(wallet) {
      return client.readContract({
        abi: courseMarketAbi,
        address: config.COURSE_MARKET_ADDRESS,
        functionName: "hasRole",
        args: [reviewerRole, wallet],
      }) as Promise<boolean>;
    },
  };
}
