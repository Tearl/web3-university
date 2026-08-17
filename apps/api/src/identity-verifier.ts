import { PrivyClient } from "@privy-io/node";
import { getAddress } from "viem";
import { config } from "./config.js";
import type { IdentityVerifier } from "./types.js";

export class IdentityNotConfiguredError extends Error {
  constructor() {
    super("Privy identity verification is not configured");
    this.name = "IdentityNotConfiguredError";
  }
}

export function createIdentityVerifier(): IdentityVerifier {
  if (!config.PRIVY_APP_ID || !config.PRIVY_APP_SECRET) {
    return {
      verify: async () => {
        throw new IdentityNotConfiguredError();
      },
    };
  }

  const client = new PrivyClient({
    appId: config.PRIVY_APP_ID,
    appSecret: config.PRIVY_APP_SECRET,
    jwtVerificationKey: config.PRIVY_VERIFICATION_KEY || undefined,
  });

  return {
    async verify(accessToken) {
      const claims = await client.utils().auth().verifyAccessToken(accessToken);
      const user = await client.users()._get(claims.user_id);
      const wallets = user.linked_accounts.flatMap((account) => {
        if (account.type !== "wallet" || account.chain_type !== "ethereum") return [];
        try {
          return [getAddress(account.address)];
        } catch {
          return [];
        }
      });
      return { privyDid: claims.user_id, wallets };
    },
  };
}
