export type CourseStatus = "PENDING" | "ACTIVE" | "REJECTED" | "OFFLINE";

export interface CourseSummary {
  id: bigint;
  title: string;
  teacher: `0x${string}`;
  priceYD: bigint;
  coverUrl: string;
  status: CourseStatus;
}

export interface PurchaseRecord {
  courseId: bigint;
  buyer: `0x${string}`;
  priceYD: bigint;
  transactionHash: `0x${string}`;
  purchasedAt: number;
}

export const SUPPORTED_CHAIN_ID = 11155111;

export interface ContractAddresses {
  ydToken?: `0x${string}`;
  courseMarket?: `0x${string}`;
  certificate?: `0x${string}`;
  completionOracle?: `0x${string}`;
}

export function createContractAddresses(values: ContractAddresses): ContractAddresses {
  return values;
}
