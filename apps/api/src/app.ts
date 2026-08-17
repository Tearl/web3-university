import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHash, randomBytes } from "node:crypto";
import { formatUnits, getAddress, parseUnits } from "viem";
import { z } from "zod";
import { config, configurationStatus } from "./config.js";
import { PrismaCourseRepository } from "./course-repository.js";
import { createPurchaseVerifier } from "./purchase-verifier.js";
import { createIdentityVerifier, IdentityNotConfiguredError } from "./identity-verifier.js";
import { PrismaProfileRepository } from "./profile-repository.js";
import { createProfileTypedData, recoverProfileSigner } from "./profile-signature.js";
import type { AuthenticatedIdentity, CourseRepository, CourseRoleVerifier, CourseSubmissionVerifier, FallbackOracleSigner, IdentityVerifier, LearningRepository, OracleChainService, ProfileRepository, PurchaseVerifier } from "./types.js";
import { createSignedVideoUrl } from "./video-url.js";
import { createCourseSubmissionVerifier } from "./course-submission-verifier.js";
import { createCourseRoleVerifier } from "./course-role-verifier.js";
import { createCourseIndex } from "./course-index.js";
import { PrismaCommentRepository } from "./comment-repository.js";
import type { CommentRepository, CourseIndex } from "./types.js";
import { PrismaLearningRepository } from "./learning-repository.js";
import { createOracleChainService } from "./oracle-chain-service.js";
import { createFallbackOracleSigner } from "./fallback-oracle-signer.js";

const courseParams = z.object({ courseId: z.coerce.bigint().positive() });
const lessonParams = courseParams.extend({ lessonId: z.string().min(1) });
const completionQuery = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  courseId: z.coerce.bigint().positive(),
  nonce: z.string().length(64).regex(/^[a-f0-9]+$/),
  expiresAt: z.coerce.number().int().positive(),
});
const progressBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  watchedSeconds: z.coerce.number().int().nonnegative(),
});
const oracleChallengeBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  courseId: z.coerce.bigint().positive(),
});
const evidenceParams = z.object({ evidenceHash: z.string().regex(/^0x[a-f0-9]{64}$/) });
const localFulfillBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  courseId: z.coerce.bigint().positive(),
  requestId: z.coerce.bigint().positive(),
});
const fallbackAttestationBody = localFulfillBody;
const nonceBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  username: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N}_-]+$/u),
});
const updateProfileBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  username: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N}_-]+$/u),
  nonce: z.string().length(64).regex(/^[a-f0-9]+$/),
  expiresAt: z.coerce.number().int().positive(),
  chainId: z.coerce.number().int().positive(),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/).transform((value) => value as `0x${string}`),
});
const courseBody = z.object({
  courseId: z.coerce.bigint().positive(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(10_000),
  coverUrl: z.url(),
  teacherProfile: z.unknown().optional(),
});
const lessonBody = z.object({
  title: z.string().trim().min(1).max(160),
  videoKey: z.string().trim().min(1).max(500),
  durationSec: z.coerce.number().int().positive(),
  orderIndex: z.coerce.number().int().nonnegative(),
});
const draftLessonBody = lessonBody;
const draftBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(10_000),
  coverUrl: z.url(),
  priceYD: z.string().regex(/^\d+(\.\d{1,18})?$/),
  teacherProfile: z.unknown().optional(),
  lessons: z.array(draftLessonBody).min(1).max(100),
});
const draftParams = z.object({ draftId: z.string().min(1) });
const submitDraftBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).transform((value) => value as `0x${string}`),
});
const courseListQuery = z.object({ ids: z.string().optional() });
const commentQuery = z.object({ cursor: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
const commentBody = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  content: z.string().trim().min(1).max(1_000),
});
const commentParams = courseParams.extend({ commentId: z.string().min(1) });
const moderateCommentBody = z.object({ wallet: z.string().transform((value) => getAddress(value)), action: z.literal("hide") });

function serializeCourse(course: Awaited<ReturnType<CourseRepository["findCourse"]>>) {
  if (!course) return null;
  return { ...course, courseId: course.courseId.toString() };
}

function serializeLesson(lesson: Awaited<ReturnType<CourseRepository["findLesson"]>>) {
  if (!lesson) return null;
  const { videoKey: _videoKey, ...publicLesson } = lesson;
  return { ...publicLesson, courseId: lesson.courseId.toString() };
}

function serializeComment(comment: Awaited<ReturnType<CommentRepository["createComment"]>>) {
  return {
    ...comment,
    courseId: comment.courseId.toString(),
    author: {
      username: comment.username,
      wallet: comment.walletAddress,
    },
    username: undefined,
    walletAddress: undefined,
  };
}

function serializeProgress(progress: Awaited<ReturnType<LearningRepository["getCourseProgress"]>>) {
  if (!progress) return null;
  return {
    ...progress,
    courseId: progress.courseId.toString(),
    lessons: progress.lessons.map((lesson) => ({ ...lesson, updatedAt: lesson.updatedAt?.toISOString() ?? null })),
    evidence: progress.evidence ? {
      ...progress.evidence, courseId: progress.evidence.courseId.toString(), issuedAt: progress.evidence.issuedAt.toISOString(),
    } : null,
  };
}

function serializeIndex(index: Awaited<ReturnType<CourseIndex["listWalletActivity"]>>["index"] | undefined) {
  if (!index) return null;
  return {
    ...index,
    indexedBlock: index.indexedBlock?.toString() ?? null,
    chainHeadBlock: index.chainHeadBlock.toString(),
    lagBlocks: index.lagBlocks?.toString() ?? null,
  };
}

function parseWallet(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

export interface AppDependencies {
  courses?: CourseRepository;
  purchases?: PurchaseVerifier;
  identities?: IdentityVerifier;
  profiles?: ProfileRepository;
  allowDevelopmentWrites?: boolean;
  now?: () => Date;
  courseSubmissions?: CourseSubmissionVerifier;
  courseRoles?: CourseRoleVerifier;
  courseIndex?: CourseIndex;
  comments?: CommentRepository;
  learning?: LearningRepository;
  oracleChain?: OracleChainService;
  oracleApiKey?: string;
  fallbackOracleSigner?: FallbackOracleSigner | null;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });
  const courses = dependencies.courses ?? new PrismaCourseRepository();
  const purchases = dependencies.purchases ?? createPurchaseVerifier();
  const identities = dependencies.identities ?? createIdentityVerifier();
  const profiles = dependencies.profiles ?? new PrismaProfileRepository();
  const now = dependencies.now ?? (() => new Date());
  const courseSubmissions = dependencies.courseSubmissions ?? createCourseSubmissionVerifier();
  const courseRoles = dependencies.courseRoles ?? createCourseRoleVerifier();
  const courseIndex = dependencies.courseIndex ?? createCourseIndex();
  const comments = dependencies.comments ?? new PrismaCommentRepository();
  const learning = dependencies.learning ?? new PrismaLearningRepository();
  const oracleChain = dependencies.oracleChain ?? createOracleChainService();
  const oracleApiKey = dependencies.oracleApiKey ?? config.ORACLE_API_KEY;
  const fallbackOracleSigner = dependencies.fallbackOracleSigner === undefined
    ? createFallbackOracleSigner()
    : dependencies.fallbackOracleSigner;
  const authenticatedRequests = new WeakMap<object, AuthenticatedIdentity>();
  const allowDevelopmentWrites = dependencies.allowDevelopmentWrites ?? config.NODE_ENV === "development";
  const isDevelopmentTeacher = (headers: Record<string, unknown>) =>
    allowDevelopmentWrites && headers["x-dev-teacher-key"] === config.DEV_TEACHER_KEY;

  void app.register(cors, {
    origin: config.WEB_ORIGIN,
    methods: ["GET", "POST", "PATCH", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization", "x-dev-teacher-key", "x-wallet-address"],
  });

  app.addHook("onClose", async () => {
    await Promise.all([courses.disconnect(), profiles.disconnect(), comments.disconnect(), learning.disconnect()]);
  });

  app.addHook("preHandler", async (request, reply) => {
    const needsIdentity =
      request.url.startsWith("/profile") ||
      request.url.startsWith("/teacher") ||
      request.url.startsWith("/learning") ||
      request.url.includes("/video") ||
      request.url.includes("/progress") ||
      request.url.startsWith("/oracle/local/") ||
      request.url.startsWith("/oracle/fallback/") ||
      ((request.method === "POST" || request.method === "PATCH") && request.url.includes("/comments"));
    if (!needsIdentity) return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: { code: "access_token_required" } });
    }
    try {
      authenticatedRequests.set(request, await identities.verify(authorization.slice(7)));
    } catch (error) {
      if (error instanceof IdentityNotConfiguredError) {
        return reply.code(503).send({ error: { code: "identity_not_configured" } });
      }
      return reply.code(401).send({ error: { code: "invalid_access_token" } });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return reply.code(500).send({ error: { code: "internal_error", message: "Unexpected server error" } });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "web3-university-api",
    features: {
      database: configurationStatus.database,
      privy: configurationStatus.privy,
      privyAppIdsMatch: configurationStatus.privyAppIdsMatch,
      fallbackOracle: Boolean(fallbackOracleSigner),
      subgraph: configurationStatus.subgraph,
    },
  }));

  app.get("/courses/:courseId", async (request, reply) => {
    const parsed = courseParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_course_id" } });
    const course = await courses.findCourse(parsed.data.courseId);
    if (!course) return reply.code(404).send({ error: { code: "course_not_found" } });
    return reply.send({ course: serializeCourse(course) });
  });

  app.get("/courses", async (request, reply) => {
    const parsed = courseListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_course_query" } });
    if (parsed.data.ids) {
      const values = parsed.data.ids.split(",").filter(Boolean);
      if (values.length === 0 || values.length > 100 || values.some((value) => !/^\d+$/.test(value) || value === "0")) {
        return reply.code(400).send({ error: { code: "invalid_course_ids" } });
      }
      const details = await courses.listCourses([...new Set(values)].map(BigInt));
      return reply.send({ courses: details.map((course) => serializeCourse(course)), source: "database" });
    }

    let indexed;
    try {
      indexed = await courseIndex.listActiveCourses();
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "course_index_unavailable" } });
    }
    const details = await courses.listCourses(indexed.courses.map((course) => course.courseId));
    const detailsById = new Map(details.map((course) => [course.courseId.toString(), course]));
    return reply.send({
      courses: indexed.courses.map((chain) => {
        const detail = detailsById.get(chain.courseId.toString());
        return {
          courseId: chain.courseId.toString(),
          teacher: chain.teacher,
          priceYD: chain.priceYD.toString(),
          metadataUri: chain.metadataUri,
          status: chain.status,
          detail: detail ? serializeCourse(detail) : null,
          partial: !detail,
        };
      }),
      source: indexed.source,
      degraded: indexed.degraded,
      index: serializeIndex(indexed.index),
    });
  });

  app.get("/courses/:courseId/mixed", async (request, reply) => {
    const parsed = courseParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_course_id" } });
    let indexed;
    try {
      indexed = await courseIndex.findCourse(parsed.data.courseId);
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "course_index_unavailable" } });
    }
    if (!indexed.course) return reply.code(404).send({ error: { code: "course_not_found" } });
    const detail = await courses.findCourse(parsed.data.courseId);
    const lessons = detail ? await courses.listLessons(parsed.data.courseId) : [];
    return reply.send({
      course: {
        courseId: indexed.course.courseId.toString(), teacher: indexed.course.teacher,
        priceYD: indexed.course.priceYD.toString(), metadataUri: indexed.course.metadataUri,
        status: indexed.course.status, detail: detail ? serializeCourse(detail) : null,
        lessons: lessons.map((lesson) => serializeLesson(lesson)), partial: !detail,
      },
      source: indexed.source,
      degraded: indexed.degraded,
      index: serializeIndex(indexed.index),
    });
  });

  app.get("/courses/:courseId/comments", async (request, reply) => {
    const params = courseParams.safeParse(request.params);
    const query = commentQuery.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: { code: "invalid_comment_query" } });
    if (!(await courses.findCourse(params.data.courseId))) return reply.code(404).send({ error: { code: "course_not_found" } });
    const page = await comments.listComments(params.data.courseId, query.data.cursor, query.data.limit);
    return reply.send({ comments: page.comments.map(serializeComment), nextCursor: page.nextCursor });
  });

  app.post("/courses/:courseId/comments", async (request, reply) => {
    const params = courseParams.safeParse(request.params);
    const body = commentBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "invalid_comment" } });
    const identity = authenticatedRequests.get(request)!;
    if (!identity.wallets.includes(body.data.wallet)) return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    if (!(await courses.findCourse(params.data.courseId))) return reply.code(404).send({ error: { code: "course_not_found" } });
    const recent = await comments.countRecentComments(identity.privyDid, new Date(now().getTime() - 60_000));
    if (recent >= config.COMMENT_RATE_LIMIT_PER_MINUTE) {
      return reply.code(429).send({ error: { code: "comment_rate_limited" } });
    }
    const comment = await comments.createComment({
      courseId: params.data.courseId, privyDid: identity.privyDid,
      wallet: body.data.wallet, content: body.data.content,
    });
    return reply.code(201).send({ comment: serializeComment(comment) });
  });

  app.patch("/courses/:courseId/comments/:commentId", async (request, reply) => {
    const params = commentParams.safeParse(request.params);
    const body = moderateCommentBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "invalid_comment_moderation" } });
    const identity = authenticatedRequests.get(request)!;
    if (!identity.wallets.includes(body.data.wallet)) return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    try {
      if (!(await courseRoles.isReviewer(body.data.wallet))) return reply.code(403).send({ error: { code: "reviewer_role_required" } });
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "chain_unavailable" } });
    }
    if (!(await comments.hideComment(params.data.commentId))) return reply.code(404).send({ error: { code: "comment_not_found" } });
    return reply.send({ comment: { id: params.data.commentId, status: "HIDDEN" } });
  });

  app.get("/courses/:courseId/lessons", async (request, reply) => {
    const parsed = courseParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_course_id" } });
    if (!(await courses.findCourse(parsed.data.courseId))) {
      return reply.code(404).send({ error: { code: "course_not_found" } });
    }
    const lessons = await courses.listLessons(parsed.data.courseId);
    return reply.send({ lessons: lessons.map((lesson) => serializeLesson(lesson)) });
  });

  app.put("/dev/courses/:courseId", async (request, reply) => {
    if (!isDevelopmentTeacher(request.headers)) {
      return reply.code(403).send({ error: { code: "dev_teacher_forbidden" } });
    }
    const params = courseParams.safeParse(request.params);
    const body = courseBody.safeParse({ ...(request.body as object), courseId: params.success ? params.data.courseId : undefined });
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "invalid_course" } });
    const course = await courses.upsertCourse(body.data);
    return reply.send({ course: serializeCourse(course) });
  });

  app.put("/dev/courses/:courseId/lessons", async (request, reply) => {
    if (!isDevelopmentTeacher(request.headers)) {
      return reply.code(403).send({ error: { code: "dev_teacher_forbidden" } });
    }
    const params = courseParams.safeParse(request.params);
    const body = lessonBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "invalid_lesson" } });
    if (!(await courses.findCourse(params.data.courseId))) {
      return reply.code(404).send({ error: { code: "course_not_found" } });
    }
    const lesson = await courses.upsertLesson({ courseId: params.data.courseId, ...body.data });
    return reply.send({ lesson: serializeLesson(lesson) });
  });

  app.get("/courses/:courseId/lessons/:lessonId/video", async (request, reply) => {
    const parsed = lessonParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_lesson" } });
    const identity = authenticatedRequests.get(request)!;
    const requestedWallet = parseWallet(request.headers["x-wallet-address"]);
    const wallet = requestedWallet ?? identity.wallets[0];
    if (!wallet || !identity.wallets.includes(wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }
    const lesson = await courses.findLesson(parsed.data.courseId, parsed.data.lessonId);
    if (!lesson) return reply.code(404).send({ error: { code: "lesson_not_found" } });

    let purchased: boolean;
    try {
      purchased = await purchases.hasPurchased(wallet, parsed.data.courseId);
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "chain_unavailable" } });
    }
    if (!purchased) return reply.code(403).send({ error: { code: "course_not_purchased" } });
    return reply.send({ video: createSignedVideoUrl(lesson.videoKey) });
  });

  app.get("/courses/:courseId/progress", async (request, reply) => {
    const params = courseParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "invalid_course_id" } });
    const identity = authenticatedRequests.get(request)!;
    const wallet = parseWallet(request.headers["x-wallet-address"]);
    if (!wallet || !identity.wallets.includes(wallet)) return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    try {
      if (!(await purchases.hasPurchased(wallet, params.data.courseId))) return reply.code(403).send({ error: { code: "course_not_purchased" } });
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "chain_unavailable" } });
    }
    const progress = await learning.getCourseProgress(identity.privyDid, params.data.courseId);
    if (!progress) return reply.code(404).send({ error: { code: "course_not_found" } });
    let certificate = null;
    try { certificate = await oracleChain.getCertificate(wallet, params.data.courseId); } catch { /* chain status is optional here */ }
    return reply.send({
      progress: serializeProgress(progress),
      certificate: certificate ? { tokenId: certificate.tokenId.toString(), tokenUri: certificate.tokenUri } : null,
      signedOracleAvailable: Boolean(fallbackOracleSigner),
    });
  });

  app.patch("/courses/:courseId/lessons/:lessonId/progress", async (request, reply) => {
    const params = lessonParams.safeParse(request.params);
    const body = progressBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "invalid_progress_update" } });
    const identity = authenticatedRequests.get(request)!;
    if (!identity.wallets.includes(body.data.wallet)) return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    try {
      if (!(await purchases.hasPurchased(body.data.wallet, params.data.courseId))) {
        return reply.code(403).send({ error: { code: "course_not_purchased" } });
      }
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "chain_unavailable" } });
    }
    const result = await learning.recordProgress({
      privyDid: identity.privyDid, wallet: body.data.wallet, courseId: params.data.courseId,
      lessonId: params.data.lessonId, watchedSeconds: body.data.watchedSeconds, now: now(),
      initialAllowanceSeconds: config.PROGRESS_INITIAL_ALLOWANCE_SECONDS,
      graceSeconds: config.PROGRESS_UPDATE_GRACE_SECONDS,
      maxDeltaSeconds: config.PROGRESS_MAX_DELTA_SECONDS,
      publicApiUrl: config.PUBLIC_API_URL,
    });
    if (result.status === "course_not_found" || result.status === "lesson_not_found") {
      return reply.code(404).send({ error: { code: result.status } });
    }
    if (result.status === "progress_regression" || result.status === "progress_jump_too_large") {
      return reply.code(409).send({ error: { code: result.status } });
    }
    if (result.status !== "updated") return reply.code(409).send({ error: { code: "progress_update_failed" } });
    return reply.send({ progress: serializeProgress(result.progress) });
  });

  app.get("/learning", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const wallet = parseWallet(request.headers["x-wallet-address"]);
    if (!wallet || !identity.wallets.includes(wallet)) return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    const records = await learning.listLearning(identity.privyDid);
    const activity = await courseIndex.listWalletActivity(wallet);
    const activityCourseIds = [...new Set([
      ...activity.purchases.map((purchase) => purchase.courseId.toString()),
      ...activity.certificates.map((certificate) => certificate.courseId.toString()),
    ])].map(BigInt);
    const activityCourses = await courses.listCourses(activityCourseIds);
    const activityTitles = new Map(
      activityCourses.map((course) => [course.courseId.toString(), course.title]),
    );
    const serialized = await Promise.all(records.map(async (progress) => {
      let certificate = null;
      try { certificate = await oracleChain.getCertificate(wallet, progress.courseId); } catch { /* report null during RPC outage */ }
      return { ...serializeProgress(progress)!, certificate: certificate ? { tokenId: certificate.tokenId.toString(), tokenUri: certificate.tokenUri } : null };
    }));
    return reply.send({
      courses: serialized,
      purchases: activity.purchases.map((purchase) => ({
        id: purchase.id,
        courseId: purchase.courseId.toString(),
        title: activityTitles.get(purchase.courseId.toString()) ?? `课程 #${purchase.courseId}`,
        priceYD: purchase.priceYD.toString(),
        purchasedAt: new Date(Number(purchase.purchasedAt) * 1_000).toISOString(),
        transactionHash: purchase.transactionHash,
      })),
      certificates: activity.certificates.map((certificate) => ({
        tokenId: certificate.tokenId.toString(),
        courseId: certificate.courseId.toString(),
        title: activityTitles.get(certificate.courseId.toString()) ?? `课程 #${certificate.courseId}`,
        tokenUri: certificate.tokenUri,
        issuedAt: new Date(Number(certificate.issuedAt) * 1_000).toISOString(),
        transactionHash: certificate.transactionHash,
      })),
      source: activity.source,
      degraded: activity.degraded,
      index: serializeIndex(activity.index),
    });
  });

  app.get("/teacher/drafts", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const wallet = parseWallet(request.headers["x-wallet-address"]);
    if (!wallet || !identity.wallets.includes(wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }
    const drafts = await courses.listDrafts(identity.privyDid, wallet);
    return reply.send({ drafts: drafts.map((draft) => ({ ...draft, courseId: draft.courseId?.toString() ?? null })) });
  });

  app.post("/teacher/drafts", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const parsed = draftBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_course_draft" } });
    if (!identity.wallets.includes(parsed.data.wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }
    try {
      if (!(await courseRoles.isTeacher(parsed.data.wallet))) {
        return reply.code(403).send({ error: { code: "teacher_role_required" } });
      }
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "chain_unavailable" } });
    }
    const price = parseUnits(parsed.data.priceYD, 18);
    if (price <= 0n) return reply.code(400).send({ error: { code: "invalid_course_price" } });
    const digest = createHash("sha256").update(JSON.stringify({
      draftNonce: randomBytes(16).toString("hex"),
      privyDid: identity.privyDid,
      wallet: parsed.data.wallet,
      title: parsed.data.title,
      description: parsed.data.description,
      coverUrl: parsed.data.coverUrl,
      priceYD: price.toString(),
      lessons: parsed.data.lessons,
    })).digest("hex");
    const draft = await courses.createDraft({
      privyDid: identity.privyDid,
      teacherWallet: parsed.data.wallet,
      title: parsed.data.title,
      description: parsed.data.description,
      coverUrl: parsed.data.coverUrl,
      teacherProfile: parsed.data.teacherProfile,
      metadataUri: `urn:web3-university:course:${digest}`,
      priceYD: price.toString(),
      lessons: parsed.data.lessons,
    });
    return reply.code(201).send({ draft: { ...draft, courseId: null, priceYDDisplay: formatUnits(price, 18) } });
  });

  app.post("/teacher/drafts/:draftId/submit", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const params = draftParams.safeParse(request.params);
    const body = submitDraftBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "invalid_course_submission" } });
    if (!identity.wallets.includes(body.data.wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }
    const draft = await courses.findDraft(params.data.draftId);
    if (!draft || draft.privyDid !== identity.privyDid || draft.teacherWallet !== body.data.wallet) {
      return reply.code(404).send({ error: { code: "course_draft_not_found" } });
    }
    if (draft.status === "SUBMITTED") {
      return reply.send({ draft: { ...draft, courseId: draft.courseId?.toString() ?? null } });
    }
    let receipt;
    try {
      receipt = await courseSubmissions.verify(body.data.transactionHash);
    } catch {
      return reply.code(409).send({ error: { code: "course_submission_not_confirmed" } });
    }
    if (
      receipt.teacher !== body.data.wallet ||
      receipt.priceYD.toString() !== draft.priceYD ||
      receipt.metadataUri !== draft.metadataUri
    ) {
      return reply.code(409).send({ error: { code: "course_submission_mismatch" } });
    }
    const submitted = await courses.submitDraft({
      id: draft.id,
      privyDid: identity.privyDid,
      teacherWallet: body.data.wallet,
      courseId: receipt.courseId,
      transactionHash: body.data.transactionHash,
    });
    if (!submitted) return reply.code(409).send({ error: { code: "course_draft_already_processed" } });
    return reply.send({ draft: { ...submitted, courseId: submitted.courseId?.toString() ?? null } });
  });

  app.get("/profile", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const profile = await profiles.findProfile(identity.privyDid);
    return reply.send({
      profile: profile ? { username: profile.username, wallet: profile.walletAddress } : null,
      linkedWallets: identity.wallets,
    });
  });

  app.post("/profile/nonce", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const parsed = nonceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_profile_request" } });
    if (!identity.wallets.includes(parsed.data.wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }

    const issuedAtSeconds = Math.floor(now().getTime() / 1000);
    const expiresAtSeconds = issuedAtSeconds + 5 * 60;
    const expiresAt = new Date(expiresAtSeconds * 1000);
    const nonce = randomBytes(32).toString("hex");
    await profiles.createNonce({
      privyDid: identity.privyDid,
      wallet: parsed.data.wallet,
      username: parsed.data.username,
      chainId: config.CHAIN_ID,
      nonce,
      expiresAt,
    });
    const message = {
      privyDid: identity.privyDid,
      wallet: parsed.data.wallet,
      username: parsed.data.username,
      nonce,
      expiresAt: BigInt(expiresAtSeconds),
    };
    const typedData = createProfileTypedData(message);
    return reply.send({
      typedData: { ...typedData, message: { ...typedData.message, expiresAt: typedData.message.expiresAt.toString() } },
      chainId: config.CHAIN_ID,
      expiresAt: expiresAtSeconds,
    });
  });

  app.patch("/profile", async (request, reply) => {
    const identity = authenticatedRequests.get(request)!;
    const parsed = updateProfileBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_profile_update" } });
    if (!identity.wallets.includes(parsed.data.wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }
    if (parsed.data.chainId !== config.CHAIN_ID) {
      return reply.code(400).send({ error: { code: "invalid_chain" } });
    }

    const nonce = await profiles.findNonce(parsed.data.nonce);
    const expiresAt = new Date(parsed.data.expiresAt * 1000);
    if (
      !nonce ||
      nonce.usedAt ||
      nonce.expiresAt.getTime() <= now().getTime() ||
      nonce.privyDid !== identity.privyDid ||
      nonce.wallet !== parsed.data.wallet ||
      nonce.username !== parsed.data.username ||
      nonce.chainId !== parsed.data.chainId ||
      nonce.expiresAt.getTime() !== expiresAt.getTime()
    ) {
      return reply.code(409).send({ error: { code: "nonce_invalid_or_used" } });
    }

    let signer: `0x${string}`;
    try {
      signer = await recoverProfileSigner({
        privyDid: identity.privyDid,
        wallet: parsed.data.wallet,
        username: parsed.data.username,
        nonce: parsed.data.nonce,
        expiresAt: BigInt(parsed.data.expiresAt),
      }, parsed.data.signature);
    } catch {
      return reply.code(400).send({ error: { code: "invalid_signature" } });
    }
    if (signer !== parsed.data.wallet) {
      return reply.code(403).send({ error: { code: "signature_wallet_mismatch" } });
    }

    const result = await profiles.consumeNonceAndUpdateProfile({
      privyDid: identity.privyDid,
      wallet: parsed.data.wallet,
      username: parsed.data.username,
      chainId: parsed.data.chainId,
      nonce: parsed.data.nonce,
      expiresAt,
    }, now());
    if (result !== "updated") {
      return reply.code(409).send({ error: { code: "nonce_invalid_or_used" } });
    }
    return reply.send({ profile: { username: parsed.data.username, wallet: parsed.data.wallet } });
  });

  app.post("/oracle/challenge", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (request.headers["x-oracle-key"] !== oracleApiKey || oracleApiKey === "change-me") {
      return reply.code(401).send({ error: { code: "oracle_not_authorized" } });
    }
    const parsed = oracleChallengeBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_oracle_challenge" } });
    const evidence = await learning.findEvidence(parsed.data.wallet, parsed.data.courseId);
    if (!evidence) return reply.code(404).send({ error: { code: "evidence_not_found" } });
    const recent = await learning.countRecentOracleNonces(new Date(now().getTime() - 60_000));
    if (recent >= config.ORACLE_RATE_LIMIT_PER_MINUTE) return reply.code(429).send({ error: { code: "oracle_rate_limited" } });
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = new Date(now().getTime() + config.ORACLE_NONCE_TTL_SECONDS * 1000);
    await learning.createOracleNonce({ wallet: parsed.data.wallet, courseId: parsed.data.courseId, nonce, expiresAt });
    request.log.info({ wallet: parsed.data.wallet, courseId: parsed.data.courseId.toString(), expiresAt: expiresAt.toISOString() }, "oracle challenge issued");
    return reply.send({ nonce, expiresAt: Math.floor(expiresAt.getTime() / 1000) });
  });

  app.get("/oracle/completion", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (request.headers["x-oracle-key"] !== oracleApiKey || oracleApiKey === "change-me") {
      return reply.code(401).send({ error: { code: "oracle_not_authorized" } });
    }
    const parsed = completionQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_query" } });
    const expiresAt = new Date(parsed.data.expiresAt * 1000);
    if (!(await learning.consumeOracleNonce({ ...parsed.data, expiresAt, now: now() }))) {
      return reply.code(409).send({ error: { code: "oracle_nonce_invalid_or_used" } });
    }
    const evidence = await learning.findEvidence(parsed.data.wallet, parsed.data.courseId);
    request.log.info({ wallet: parsed.data.wallet, courseId: parsed.data.courseId.toString(), found: Boolean(evidence) }, "oracle completion checked");
    return reply.send({
      wallet: parsed.data.wallet,
      courseId: parsed.data.courseId.toString(),
      completed: evidence?.progress === 100,
      evidenceHash: evidence?.evidenceHash ?? null,
      tokenUri: evidence?.tokenUri ?? null,
    });
  });

  app.get("/certificates/metadata/:evidenceHash", async (request, reply) => {
    const params = evidenceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "invalid_evidence_hash" } });
    const evidence = await learning.findEvidenceByHash(params.data.evidenceHash);
    if (!evidence) return reply.code(404).send({ error: { code: "evidence_not_found" } });
    const course = await courses.findCourse(evidence.courseId);
    if (!course) return reply.code(404).send({ error: { code: "course_not_found" } });
    return reply.send({
      name: `Web3 University · ${course.title}`,
      description: "通过学习进度 evidence 验证并由 CompletionOracle 铸造的不可转让课程证书。",
      image: config.CERTIFICATE_IMAGE_URL,
      external_url: `${config.WEB_ORIGIN}/courses/${evidence.courseId.toString()}`,
      attributes: [
        { trait_type: "Course ID", value: evidence.courseId.toString() },
        { trait_type: "Student", value: evidence.wallet },
        { trait_type: "Progress", value: evidence.progress },
        { trait_type: "Evidence", value: evidence.evidenceHash },
      ],
    });
  });

  app.post("/oracle/local/fulfill", async (request, reply) => {
    const body = localFulfillBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { code: "invalid_local_fulfillment" } });
    const identity = authenticatedRequests.get(request)!;
    if (!identity.wallets.includes(body.data.wallet)) return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    const evidence = await learning.findEvidence(body.data.wallet, body.data.courseId);
    if (!evidence) return reply.code(409).send({ error: { code: "evidence_not_found" } });
    try {
      const chainRequest = await oracleChain.getRequest(body.data.requestId);
      if (!chainRequest || chainRequest.student !== body.data.wallet || chainRequest.courseId !== body.data.courseId) {
        return reply.code(409).send({ error: { code: "oracle_request_mismatch" } });
      }
      if (chainRequest.fulfilled) return reply.code(409).send({ error: { code: "oracle_request_already_fulfilled" } });
      const existing = await oracleChain.getCertificate(body.data.wallet, body.data.courseId);
      if (existing) return reply.send({ certificate: { tokenId: existing.tokenId.toString(), tokenUri: existing.tokenUri }, alreadyIssued: true });
      const transactionHash = await oracleChain.fulfill({ requestId: body.data.requestId, evidenceHash: evidence.evidenceHash, tokenUri: evidence.tokenUri });
      const certificate = await oracleChain.getCertificate(body.data.wallet, body.data.courseId);
      return reply.send({ transactionHash, certificate: certificate ? { tokenId: certificate.tokenId.toString(), tokenUri: certificate.tokenUri } : null });
    } catch (error) {
      request.log.error(error);
      if (error instanceof Error && error.message === "local_fulfillment_disabled") {
        return reply.code(409).send({ error: { code: "local_fulfillment_disabled" } });
      }
      return reply.code(503).send({ error: { code: "local_oracle_unavailable" } });
    }
  });

  app.post("/oracle/fallback/attestation", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!fallbackOracleSigner) {
      return reply.code(503).send({ error: { code: "signed_oracle_unavailable" } });
    }
    const body = fallbackAttestationBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: "invalid_fallback_attestation" } });
    }
    const identity = authenticatedRequests.get(request)!;
    if (!identity.wallets.includes(body.data.wallet)) {
      return reply.code(403).send({ error: { code: "wallet_not_linked" } });
    }

    const evidence = await learning.findEvidence(body.data.wallet, body.data.courseId);
    if (!evidence) return reply.code(409).send({ error: { code: "evidence_not_found" } });
    if (!/^0x[a-f0-9]{64}$/.test(evidence.evidenceHash)) {
      request.log.error({ evidenceHash: "redacted" }, "invalid completion evidence hash");
      return reply.code(409).send({ error: { code: "invalid_evidence_hash" } });
    }

    try {
      const chainRequest = await oracleChain.getRequest(body.data.requestId);
      if (
        !chainRequest ||
        chainRequest.student !== body.data.wallet ||
        chainRequest.courseId !== body.data.courseId
      ) {
        return reply.code(409).send({ error: { code: "oracle_request_mismatch" } });
      }
      if (chainRequest.status !== 1 || chainRequest.fulfilled) {
        return reply.code(409).send({ error: { code: "oracle_request_not_pending" } });
      }
      if (await oracleChain.getCertificate(body.data.wallet, body.data.courseId)) {
        return reply.code(409).send({ error: { code: "certificate_already_issued" } });
      }

      const deadline = BigInt(
        Math.floor(now().getTime() / 1000) + config.FALLBACK_ATTESTATION_TTL_SECONDS,
      );
      const evidenceHash = evidence.evidenceHash as `0x${string}`;
      const signature = await fallbackOracleSigner.signCompletion({
        requestId: body.data.requestId,
        student: body.data.wallet,
        courseId: body.data.courseId,
        evidenceHash,
        tokenUri: evidence.tokenUri,
        deadline,
      });
      request.log.info({
        requestId: body.data.requestId.toString(),
        wallet: body.data.wallet,
        courseId: body.data.courseId.toString(),
        deadline: deadline.toString(),
      }, "fallback completion attestation signed");
      return reply.send({
        requestId: body.data.requestId.toString(),
        student: body.data.wallet,
        courseId: body.data.courseId.toString(),
        evidenceHash,
        tokenUri: evidence.tokenUri,
        deadline: deadline.toString(),
        signer: fallbackOracleSigner.address,
        signature,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(503).send({ error: { code: "signed_oracle_unavailable" } });
    }
  });

  return app;
}
