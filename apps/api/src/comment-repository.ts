import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { CommentRecord, CommentRepository } from "./types.js";

function commentRecord(record: {
  id: string;
  courseId: bigint;
  content: string;
  status: "VISIBLE" | "HIDDEN" | "PENDING";
  createdAt: Date;
  user: { username: string | null; walletAddress: string };
}): CommentRecord {
  return { ...record, username: record.user.username, walletAddress: record.user.walletAddress };
}

export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listComments(courseId: bigint, cursor: string | undefined, limit: number) {
    const records = await this.client.comment.findMany({
      where: { courseId, status: "VISIBLE" },
      include: { user: { select: { username: true, walletAddress: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = records.length > limit;
    const visible = records.slice(0, limit);
    return { comments: visible.map(commentRecord), nextCursor: hasMore ? visible.at(-1)!.id : null };
  }

  countRecentComments(privyDid: string, since: Date) {
    return this.client.comment.count({ where: { user: { privyDid }, createdAt: { gte: since } } });
  }

  async createComment(input: { courseId: bigint; privyDid: string; wallet: string; content: string }) {
    const record = await this.client.$transaction(async (transaction) => {
      const user = await transaction.user.upsert({
        where: { privyDid: input.privyDid },
        create: { privyDid: input.privyDid, walletAddress: input.wallet },
        update: { walletAddress: input.wallet },
      });
      return transaction.comment.create({
        data: { courseId: input.courseId, userId: user.id, content: input.content },
        include: { user: { select: { username: true, walletAddress: true } } },
      });
    });
    return commentRecord(record);
  }

  async hideComment(id: string) {
    const updated = await this.client.comment.updateMany({
      where: { id, status: { not: "HIDDEN" } },
      data: { status: "HIDDEN" },
    });
    return updated.count === 1;
  }

  async disconnect() {
    await this.client.$disconnect();
  }
}
