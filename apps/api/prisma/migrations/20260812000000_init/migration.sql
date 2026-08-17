CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'PENDING');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "privy_did" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "username" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_details" (
    "course_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover_url" TEXT NOT NULL,
    "teacher_profile" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "course_details_pkey" PRIMARY KEY ("course_id")
);

CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "video_key" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,
    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "watched_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "profile_nonces" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_nonces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oracle_evidence" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "course_id" BIGINT NOT NULL,
    "progress" INTEGER NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oracle_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_privy_did_key" ON "users"("privy_did");
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");
CREATE UNIQUE INDEX "lessons_course_id_order_index_key" ON "lessons"("course_id", "order_index");
CREATE INDEX "comments_course_id_created_at_idx" ON "comments"("course_id", "created_at");
CREATE INDEX "learning_progress_user_id_course_id_idx" ON "learning_progress"("user_id", "course_id");
CREATE UNIQUE INDEX "learning_progress_user_id_lesson_id_key" ON "learning_progress"("user_id", "lesson_id");
CREATE UNIQUE INDEX "profile_nonces_nonce_key" ON "profile_nonces"("nonce");
CREATE INDEX "profile_nonces_wallet_expires_at_idx" ON "profile_nonces"("wallet", "expires_at");
CREATE UNIQUE INDEX "oracle_evidence_wallet_course_id_key" ON "oracle_evidence"("wallet", "course_id");

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_details"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_details"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_details"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
