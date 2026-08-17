import { getAddress, recoverTypedDataAddress } from "viem";
import { config } from "./config.js";

export const updateProfileTypes = {
  UpdateProfile: [
    { name: "privyDid", type: "string" },
    { name: "wallet", type: "address" },
    { name: "username", type: "string" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export const profileDomain = {
  name: "Web3University",
  version: "1",
  chainId: config.CHAIN_ID,
} as const;

export interface UpdateProfileMessage {
  privyDid: string;
  wallet: `0x${string}`;
  username: string;
  nonce: string;
  expiresAt: bigint;
}

export function createProfileTypedData(message: UpdateProfileMessage) {
  return { domain: profileDomain, types: updateProfileTypes, primaryType: "UpdateProfile" as const, message };
}

export async function recoverProfileSigner(message: UpdateProfileMessage, signature: `0x${string}`) {
  return getAddress(await recoverTypedDataAddress({ ...createProfileTypedData(message), signature }));
}
