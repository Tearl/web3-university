ALTER TABLE "oracle_evidence"
ADD COLUMN "token_uri" TEXT NOT NULL DEFAULT '';

ALTER TABLE "learning_progress"
ADD COLUMN "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "oracle_nonces" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oracle_nonces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oracle_nonces_nonce_key" ON "oracle_nonces"("nonce");
CREATE INDEX "oracle_nonces_wallet_course_id_expires_at_idx"
ON "oracle_nonces"("wallet", "course_id", "expires_at");
