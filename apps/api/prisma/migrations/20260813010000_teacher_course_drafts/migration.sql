CREATE TYPE "CourseDraftStatus" AS ENUM ('DRAFT', 'SUBMITTED');

CREATE TABLE "course_drafts" (
    "id" TEXT NOT NULL,
    "privy_did" TEXT NOT NULL,
    "teacher_wallet" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover_url" TEXT NOT NULL,
    "teacher_profile" JSONB,
    "metadata_uri" TEXT NOT NULL,
    "price_yd" TEXT NOT NULL,
    "lessons" JSONB NOT NULL,
    "status" "CourseDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "course_id" BIGINT,
    "transaction_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "course_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_drafts_metadata_uri_key" ON "course_drafts"("metadata_uri");
CREATE UNIQUE INDEX "course_drafts_course_id_key" ON "course_drafts"("course_id");
CREATE UNIQUE INDEX "course_drafts_transaction_hash_key" ON "course_drafts"("transaction_hash");
CREATE INDEX "course_drafts_privy_did_teacher_wallet_created_at_idx" ON "course_drafts"("privy_did", "teacher_wallet", "created_at");
