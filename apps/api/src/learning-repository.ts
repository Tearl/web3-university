import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { CourseProgressRecord, LearningRepository, OracleEvidenceRecord } from "./types.js";

type CourseWithProgress = Awaited<ReturnType<PrismaLearningRepository["loadCourse"]>>;

function evidenceRecord(record: {
  wallet: string; courseId: bigint; progress: number; evidenceHash: string; tokenUri: string; issuedAt: Date;
}): OracleEvidenceRecord {
  return record;
}

function aggregateCourse(course: NonNullable<CourseWithProgress>, evidence: OracleEvidenceRecord | null): CourseProgressRecord {
  const lessons = course.lessons.map((lesson) => {
    const progress = lesson.progress[0];
    return {
      lessonId: lesson.id,
      title: lesson.title,
      durationSec: lesson.durationSec,
      watchedSeconds: progress?.watchedSeconds ?? 0,
      completed: progress?.completed ?? false,
      updatedAt: progress?.updatedAt ?? null,
    };
  });
  const durationSec = lessons.reduce((total, lesson) => total + lesson.durationSec, 0);
  const watchedSeconds = lessons.reduce((total, lesson) => total + Math.min(lesson.watchedSeconds, lesson.durationSec), 0);
  return {
    courseId: course.courseId,
    title: course.title,
    coverUrl: course.coverUrl,
    watchedSeconds,
    durationSec,
    progress: durationSec === 0 ? 0 : Math.floor((watchedSeconds * 100) / durationSec),
    lessons,
    evidence,
  };
}

export function validateProgressWindow(input: {
  requested: number;
  current: number;
  startedAt: Date | null;
  updatedAt: Date | null;
  now: Date;
  initialAllowanceSeconds: number;
  graceSeconds: number;
  maxDeltaSeconds: number;
}) {
  if (input.requested < input.current) return "progress_regression" as const;
  const absoluteAllowance = input.startedAt
    ? input.initialAllowanceSeconds + Math.max(0, Math.floor((input.now.getTime() - input.startedAt.getTime()) / 1000))
    : input.initialAllowanceSeconds;
  const elapsedSinceUpdate = input.updatedAt
    ? Math.max(0, Math.floor((input.now.getTime() - input.updatedAt.getTime()) / 1000))
    : input.initialAllowanceSeconds;
  const deltaAllowance = Math.min(input.maxDeltaSeconds, elapsedSinceUpdate + input.graceSeconds);
  if (input.requested > absoluteAllowance || input.requested - input.current > deltaAllowance) return "progress_jump_too_large" as const;
  return "allowed" as const;
}

export function createEvidenceHash(payload: object) {
  return `0x${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export class PrismaLearningRepository implements LearningRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  loadCourse(client: PrismaClient, privyDid: string, courseId: bigint) {
    return client.courseDetail.findUnique({
      where: { courseId },
      select: {
        courseId: true, title: true, coverUrl: true,
        lessons: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true, title: true, durationSec: true,
            progress: {
              where: { user: { privyDid } }, take: 1,
              select: { watchedSeconds: true, completed: true, updatedAt: true },
            },
          },
        },
      },
    });
  }

  async getCourseProgress(privyDid: string, courseId: bigint) {
    const [course, user] = await Promise.all([
      this.loadCourse(this.client, privyDid, courseId),
      this.client.user.findUnique({ where: { privyDid }, select: { walletAddress: true } }),
    ]);
    if (!course) return null;
    const evidence = user ? await this.findEvidence(user.walletAddress, courseId) : null;
    return aggregateCourse(course, evidence);
  }

  async listLearning(privyDid: string) {
    const user = await this.client.user.findUnique({ where: { privyDid }, select: { id: true, walletAddress: true } });
    if (!user) return [];
    const courseIds = (await this.client.learningProgress.findMany({
      where: { userId: user.id }, distinct: ["courseId"], select: { courseId: true }, orderBy: { courseId: "asc" },
    })).map((record) => record.courseId);
    return Promise.all(courseIds.map(async (courseId) => {
      const [course, evidence] = await Promise.all([
        this.loadCourse(this.client, privyDid, courseId), this.findEvidence(user.walletAddress, courseId),
      ]);
      return course ? aggregateCourse(course, evidence) : null;
    })).then((records) => records.filter((record): record is CourseProgressRecord => record !== null));
  }

  async recordProgress(input: Parameters<LearningRepository["recordProgress"]>[0]) {
    return this.client.$transaction(async (transaction) => {
      const course = await transaction.courseDetail.findUnique({ where: { courseId: input.courseId }, select: { courseId: true } });
      if (!course) return { status: "course_not_found" } as const;
      const lesson = await transaction.lesson.findFirst({
        where: { id: input.lessonId, courseId: input.courseId }, select: { id: true, durationSec: true },
      });
      if (!lesson) return { status: "lesson_not_found" } as const;
      const user = await transaction.user.upsert({
        where: { privyDid: input.privyDid },
        create: { privyDid: input.privyDid, walletAddress: input.wallet },
        update: { walletAddress: input.wallet },
      });
      const existing = await transaction.learningProgress.findUnique({
        where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
        select: { watchedSeconds: true, startedAt: true, updatedAt: true },
      });
      const requested = Math.min(input.watchedSeconds, lesson.durationSec);
      const current = existing?.watchedSeconds ?? 0;
      const validation = validateProgressWindow({
        requested, current, startedAt: existing?.startedAt ?? null, updatedAt: existing?.updatedAt ?? null,
        now: input.now, initialAllowanceSeconds: input.initialAllowanceSeconds,
        graceSeconds: input.graceSeconds, maxDeltaSeconds: input.maxDeltaSeconds,
      });
      if (validation !== "allowed") return { status: validation } as const;
      await transaction.learningProgress.upsert({
        where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
        create: {
          userId: user.id, courseId: input.courseId, lessonId: lesson.id,
          watchedSeconds: requested, completed: requested >= lesson.durationSec, startedAt: input.now,
        },
        update: { watchedSeconds: requested, completed: requested >= lesson.durationSec },
      });

      const lessons = await transaction.lesson.findMany({
        where: { courseId: input.courseId }, orderBy: { orderIndex: "asc" },
        select: {
          id: true, title: true, durationSec: true,
          progress: { where: { userId: user.id }, take: 1, select: { watchedSeconds: true, completed: true, updatedAt: true } },
        },
      });
      const detail = await transaction.courseDetail.findUniqueOrThrow({
        where: { courseId: input.courseId }, select: { courseId: true, title: true, coverUrl: true },
      });
      let evidence = await transaction.oracleEvidence.findUnique({
        where: { wallet_courseId: { wallet: input.wallet, courseId: input.courseId } },
      });
      const provisional = aggregateCourse({ ...detail, lessons }, evidence ? evidenceRecord(evidence) : null);
      if (provisional.durationSec > 0 && provisional.watchedSeconds === provisional.durationSec && !evidence) {
        const payload = {
          version: 1, privyDid: input.privyDid, wallet: input.wallet.toLowerCase(), courseId: input.courseId.toString(),
          lessons: provisional.lessons.map((item) => ({ id: item.lessonId, watchedSeconds: item.watchedSeconds, durationSec: item.durationSec, completed: item.completed })),
          progress: 100,
        };
        const evidenceHash = createEvidenceHash(payload);
        evidence = await transaction.oracleEvidence.create({
          data: {
            wallet: input.wallet, courseId: input.courseId, progress: 100, evidenceHash,
            tokenUri: `${input.publicApiUrl}/certificates/metadata/${evidenceHash}`,
          },
        });
      }
      return { status: "updated", progress: aggregateCourse({ ...detail, lessons }, evidence ? evidenceRecord(evidence) : null) } as const;
    });
  }

  async findEvidence(wallet: string, courseId: bigint) {
    const record = await this.client.oracleEvidence.findUnique({ where: { wallet_courseId: { wallet, courseId } } });
    return record ? evidenceRecord(record) : null;
  }

  async findEvidenceByHash(evidenceHash: string) {
    const record = await this.client.oracleEvidence.findFirst({ where: { evidenceHash } });
    return record ? evidenceRecord(record) : null;
  }

  async createOracleNonce(input: { wallet: string; courseId: bigint; nonce: string; expiresAt: Date }) {
    await this.client.oracleNonce.create({ data: input });
  }

  countRecentOracleNonces(since: Date) {
    return this.client.oracleNonce.count({ where: { createdAt: { gte: since } } });
  }

  async consumeOracleNonce(input: { wallet: string; courseId: bigint; nonce: string; expiresAt: Date; now: Date }) {
    const result = await this.client.oracleNonce.updateMany({
      where: { wallet: input.wallet, courseId: input.courseId, nonce: input.nonce, expiresAt: input.expiresAt, AND: { expiresAt: { gt: input.now } }, usedAt: null },
      data: { usedAt: input.now },
    });
    return result.count === 1;
  }

  async disconnect() { await this.client.$disconnect(); }
}
