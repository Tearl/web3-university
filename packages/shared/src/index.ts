import courseMarketAbiJson from "./abi/CourseMarket.json" with { type: "json" };
import ydTokenAbiJson from "./abi/YDToken.json" with { type: "json" };
import courseCertificateAbiJson from "./abi/CourseCertificate.json" with { type: "json" };
import completionOracleAbiJson from "./abi/CompletionOracle.json" with { type: "json" };
import mockUsdcAbiJson from "./abi/MockUSDC.json" with { type: "json" };
import testnetSwapGatewayAbiJson from "./abi/TestnetSwapGateway.json" with { type: "json" };

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

export const LOCAL_CHAIN_ID = 31337;
export const SEPOLIA_CHAIN_ID = 11155111;
export const SUPPORTED_CHAIN_ID = LOCAL_CHAIN_ID;

export const localContracts = {
  ydToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  courseMarket: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  certificate: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  completionOracle: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
} as const satisfies Required<ContractAddresses>;

// These JSON values are generated from Foundry/Solidity build artifacts.
export const ydTokenAbi = ydTokenAbiJson;
export const courseMarketAbi = courseMarketAbiJson;
export const courseCertificateAbi = courseCertificateAbiJson;
export const completionOracleAbi = completionOracleAbiJson;
export const mockUsdcAbi = mockUsdcAbiJson;
export const testnetSwapGatewayAbi = testnetSwapGatewayAbiJson;

export interface ContractAddresses {
  ydToken?: `0x${string}`;
  courseMarket?: `0x${string}`;
  certificate?: `0x${string}`;
  completionOracle?: `0x${string}`;
}

export function createContractAddresses(values: ContractAddresses): ContractAddresses {
  return values;
}
