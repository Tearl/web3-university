ALTER TABLE "profile_nonces"
ADD COLUMN "privy_did" TEXT NOT NULL,
ADD COLUMN "username" TEXT NOT NULL,
ADD COLUMN "chain_id" INTEGER NOT NULL;

DROP INDEX "profile_nonces_wallet_expires_at_idx";
CREATE INDEX "profile_nonces_privy_did_wallet_expires_at_idx"
ON "profile_nonces"("privy_did", "wallet", "expires_at");
