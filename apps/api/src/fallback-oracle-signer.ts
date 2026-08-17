import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import type { FallbackOracleSigner } from "./types.js";

export const completionAttestationTypes = {
  CompletionAttestation: [
    { name: "requestId", type: "uint256" },
    { name: "student", type: "address" },
    { name: "courseId", type: "uint256" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "tokenURI", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function createFallbackOracleSigner(): FallbackOracleSigner | null {
  if (!config.FALLBACK_ORACLE_PRIVATE_KEY && !config.FALLBACK_ORACLE_SIGNER_ADDRESS) return null;
  if (!config.FALLBACK_ORACLE_PRIVATE_KEY || !config.FALLBACK_ORACLE_SIGNER_ADDRESS) {
    throw new Error("Fallback Oracle private key and signer address must be configured together");
  }

  const account = privateKeyToAccount(config.FALLBACK_ORACLE_PRIVATE_KEY as `0x${string}`);
  const configuredSigner = getAddress(config.FALLBACK_ORACLE_SIGNER_ADDRESS);
  if (account.address !== configuredSigner) {
    throw new Error("Fallback Oracle private key does not match FALLBACK_ORACLE_SIGNER_ADDRESS");
  }

  return {
    address: account.address,
    async signCompletion(input) {
      return account.signTypedData({
        domain: {
          name: "Web3UniversityCompletionOracle",
          version: "1",
          chainId: config.CHAIN_ID,
          verifyingContract: config.COMPLETION_ORACLE_ADDRESS,
        },
        types: completionAttestationTypes,
        primaryType: "CompletionAttestation",
        message: {
          requestId: input.requestId,
          student: input.student,
          courseId: input.courseId,
          evidenceHash: input.evidenceHash,
          tokenURI: input.tokenUri,
          deadline: input.deadline,
        },
      });
    },
  };
}
