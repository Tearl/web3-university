import type {
  CourseRecord,
  CourseDraftRecord,
  CreateCourseDraftInput,
  SubmitCourseDraftInput,
  CourseRepository,
  CreateCourseInput,
  CreateLessonInput,
  LessonRecord,
  CreateProfileNonceInput,
  ProfileNonceRecord,
  ProfileRecord,
  ProfileRepository,
  ChainCourseRecord,
  CommentRecord,
  CommentRepository,
  CourseIndex,
} from "../src/types.js";

const now = new Date("2026-08-12T00:00:00.000Z");

export class MemoryCourseRepository implements CourseRepository {
  courses = new Map<bigint, CourseRecord>([
    [1n, { courseId: 1n, title: "Solidity", description: "Learn Solidity", coverUrl: "https://example.com/cover.png", teacherProfile: null, createdAt: now, updatedAt: now }],
  ]);
  lessons: LessonRecord[] = [
    { id: "lesson-1", courseId: 1n, title: "Storage", videoKey: "course-1/storage.mp4", durationSec: 600, orderIndex: 0 },
  ];
  disconnected = false;
  drafts = new Map<string, CourseDraftRecord>();

  async findCourse(courseId: bigint) {
    return this.courses.get(courseId) ?? null;
  }

  async listCourses(courseIds: bigint[]) {
    return courseIds.flatMap((courseId) => {
      const course = this.courses.get(courseId);
      return course ? [course] : [];
    });
  }

  async listLessons(courseId: bigint) {
    return this.lessons.filter((lesson) => lesson.courseId === courseId).sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async findLesson(courseId: bigint, lessonId: string) {
    return this.lessons.find((lesson) => lesson.courseId === courseId && lesson.id === lessonId) ?? null;
  }

  async upsertCourse(input: CreateCourseInput) {
    const previous = this.courses.get(input.courseId);
    const course: CourseRecord = {
      ...input,
      teacherProfile: input.teacherProfile ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.courses.set(input.courseId, course);
    return course;
  }

  async upsertLesson(input: CreateLessonInput) {
    const existing = this.lessons.find((lesson) => lesson.courseId === input.courseId && lesson.orderIndex === input.orderIndex);
    const lesson = { ...input, id: existing?.id ?? `lesson-${this.lessons.length + 1}` };
    if (existing) Object.assign(existing, lesson);
    else this.lessons.push(lesson);
    return lesson;
  }

  async createDraft(input: CreateCourseDraftInput) {
    const id = `draft-${this.drafts.size + 1}`;
    const draft: CourseDraftRecord = {
      ...input,
      id,
      teacherProfile: input.teacherProfile ?? null,
      status: "DRAFT",
      courseId: null,
      transactionHash: null,
      createdAt: now,
      updatedAt: now,
    };
    this.drafts.set(id, draft);
    return draft;
  }

  async listDrafts(privyDid: string, wallet: string) {
    return [...this.drafts.values()].filter((draft) => draft.privyDid === privyDid && draft.teacherWallet === wallet);
  }

  async findDraft(id: string) {
    return this.drafts.get(id) ?? null;
  }

  async submitDraft(input: SubmitCourseDraftInput) {
    const draft = this.drafts.get(input.id);
    if (!draft || draft.status !== "DRAFT" || draft.privyDid !== input.privyDid || draft.teacherWallet !== input.teacherWallet) return null;
    draft.status = "SUBMITTED";
    draft.courseId = input.courseId;
    draft.transactionHash = input.transactionHash;
    await this.upsertCourse({
      courseId: input.courseId,
      title: draft.title,
      description: draft.description,
      coverUrl: draft.coverUrl,
      teacherProfile: draft.teacherProfile,
    });
    for (const lesson of draft.lessons) await this.upsertLesson({ courseId: input.courseId, ...lesson });
    return draft;
  }

  async disconnect() {
    this.disconnected = true;
  }
}

export class MemoryCourseIndex implements CourseIndex {
  records = new Map<bigint, ChainCourseRecord>([
    [1n, { courseId: 1n, teacher: purchasedWallet, priceYD: 4_000_000_000_000_000_000n, metadataUri: "urn:course:1", status: 1 }],
  ]);
  source: "subgraph" | "rpc" = "subgraph";
  degraded = false;

  async listActiveCourses() {
    return { courses: [...this.records.values()].filter((course) => course.status === 1), source: this.source, degraded: this.degraded };
  }

  async findCourse(courseId: bigint) {
    return { course: this.records.get(courseId) ?? null, source: this.source, degraded: this.degraded };
  }

  async listWalletActivity(wallet: `0x${string}`) {
    return {
      purchases: [{
        id: "purchase-1",
        courseId: 1n,
        buyer: wallet,
        priceYD: 4_000_000_000_000_000_000n,
        purchasedAt: 1_765_497_600n,
        transactionHash: `0x${"11".repeat(32)}` as `0x${string}`,
      }],
      certificates: [],
      source: this.source,
      degraded: this.degraded,
      index: {
        source: this.source,
        indexedBlock: this.source === "subgraph" ? 100n : null,
        chainHeadBlock: 100n,
        lagBlocks: this.source === "subgraph" ? 0n : null,
        caughtUp: this.source === "subgraph",
        hasIndexingErrors: false,
      },
    };
  }
}

export class MemoryCommentRepository implements CommentRepository {
  comments: CommentRecord[] = [];
  disconnected = false;

  async listComments(courseId: bigint, cursor: string | undefined, limit: number) {
    const visible = this.comments.filter((comment) => comment.courseId === courseId && comment.status === "VISIBLE");
    const start = cursor ? visible.findIndex((comment) => comment.id === cursor) + 1 : 0;
    const page = visible.slice(start, start + limit);
    return { comments: page, nextCursor: start + limit < visible.length ? page.at(-1)!.id : null };
  }

  async countRecentComments(privyDid: string, since: Date) {
    return this.comments.filter((comment) => comment.walletAddress === purchasedWallet && comment.createdAt >= since).length;
  }

  async createComment(input: { courseId: bigint; privyDid: string; wallet: string; content: string }) {
    const comment: CommentRecord = {
      id: `comment-${this.comments.length + 1}`, courseId: input.courseId, content: input.content,
      status: "VISIBLE", createdAt: new Date("2026-08-12T00:00:00.000Z"),
      username: "student", walletAddress: input.wallet,
    };
    this.comments.unshift(comment);
    return comment;
  }

  async hideComment(id: string) {
    const comment = this.comments.find((item) => item.id === id);
    if (!comment || comment.status === "HIDDEN") return false;
    comment.status = "HIDDEN";
    return true;
  }

  async disconnect() { this.disconnected = true; }
}

export const purchasedWallet = "0x0000000000000000000000000000000000000001" as const;

export class MemoryProfileRepository implements ProfileRepository {
  profiles = new Map<string, ProfileRecord>();
  nonces = new Map<string, ProfileNonceRecord>();
  disconnected = false;

  async findProfile(privyDid: string) {
    return this.profiles.get(privyDid) ?? null;
  }

  async createNonce(input: CreateProfileNonceInput) {
    const nonce = { ...input, usedAt: null };
    this.nonces.set(input.nonce, nonce);
    return nonce;
  }

  async findNonce(nonce: string) {
    return this.nonces.get(nonce) ?? null;
  }

  async consumeNonceAndUpdateProfile(input: CreateProfileNonceInput, currentTime: Date) {
    const nonce = this.nonces.get(input.nonce);
    if (
      !nonce || nonce.usedAt || nonce.expiresAt <= currentTime || nonce.privyDid !== input.privyDid ||
      nonce.wallet !== input.wallet || nonce.username !== input.username || nonce.chainId !== input.chainId ||
      nonce.expiresAt.getTime() !== input.expiresAt.getTime()
    ) return "invalid_or_used" as const;
    nonce.usedAt = currentTime;
    this.profiles.set(input.privyDid, {
      privyDid: input.privyDid,
      walletAddress: input.wallet,
      username: input.username,
    });
    return "updated" as const;
  }

  async disconnect() {
    this.disconnected = true;
  }
}
