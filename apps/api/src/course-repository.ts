import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { CourseDraftLesson, CourseRepository, CreateCourseDraftInput, CreateCourseInput, CreateLessonInput, SubmitCourseDraftInput } from "./types.js";

function draftRecord(record: {
  id: string; privyDid: string; teacherWallet: string; title: string; description: string; coverUrl: string;
  teacherProfile: unknown; metadataUri: string; priceYD: string; lessons: unknown; status: "DRAFT" | "SUBMITTED";
  courseId: bigint | null; transactionHash: string | null; createdAt: Date; updatedAt: Date;
}) {
  return { ...record, lessons: record.lessons as CourseDraftLesson[] };
}

export class PrismaCourseRepository implements CourseRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  findCourse(courseId: bigint) {
    return this.client.courseDetail.findUnique({ where: { courseId } });
  }

  listCourses(courseIds: bigint[]) {
    return this.client.courseDetail.findMany({ where: { courseId: { in: courseIds } } });
  }

  listLessons(courseId: bigint) {
    return this.client.lesson.findMany({ where: { courseId }, orderBy: { orderIndex: "asc" } });
  }

  findLesson(courseId: bigint, lessonId: string) {
    return this.client.lesson.findFirst({ where: { id: lessonId, courseId } });
  }

  upsertCourse(input: CreateCourseInput) {
    const data = { ...input, teacherProfile: input.teacherProfile ?? undefined };
    return this.client.courseDetail.upsert({
      where: { courseId: input.courseId },
      create: data,
      update: data,
    });
  }

  upsertLesson(input: CreateLessonInput) {
    const { courseId, orderIndex, ...data } = input;
    return this.client.lesson.upsert({
      where: { courseId_orderIndex: { courseId, orderIndex } },
      create: input,
      update: data,
    });
  }

  async createDraft(input: CreateCourseDraftInput) {
    const record = await this.client.courseDraft.create({
      data: {
        ...input,
        teacherProfile: input.teacherProfile as Prisma.InputJsonValue | undefined,
        lessons: input.lessons as unknown as Prisma.InputJsonValue,
      },
    });
    return draftRecord(record);
  }

  async listDrafts(privyDid: string, wallet: string) {
    const records = await this.client.courseDraft.findMany({
      where: { privyDid, teacherWallet: wallet },
      orderBy: { createdAt: "desc" },
    });
    return records.map(draftRecord);
  }

  async findDraft(id: string) {
    const record = await this.client.courseDraft.findUnique({ where: { id } });
    return record ? draftRecord(record) : null;
  }

  async submitDraft(input: SubmitCourseDraftInput) {
    return this.client.$transaction(async (transaction) => {
      const draft = await transaction.courseDraft.findFirst({
        where: { id: input.id, privyDid: input.privyDid, teacherWallet: input.teacherWallet, status: "DRAFT" },
      });
      if (!draft) return null;
      const lessons = draft.lessons as unknown as CourseDraftLesson[];
      await transaction.courseDetail.upsert({
        where: { courseId: input.courseId },
        create: {
          courseId: input.courseId, title: draft.title, description: draft.description,
          coverUrl: draft.coverUrl, teacherProfile: draft.teacherProfile ?? undefined,
        },
        update: {
          title: draft.title, description: draft.description, coverUrl: draft.coverUrl,
          teacherProfile: draft.teacherProfile ?? undefined,
        },
      });
      for (const lesson of lessons) {
        const { orderIndex, ...data } = lesson;
        await transaction.lesson.upsert({
          where: { courseId_orderIndex: { courseId: input.courseId, orderIndex } },
          create: { courseId: input.courseId, orderIndex, ...data },
          update: data,
        });
      }
      const updated = await transaction.courseDraft.update({
        where: { id: input.id },
        data: { status: "SUBMITTED", courseId: input.courseId, transactionHash: input.transactionHash },
      });
      return draftRecord(updated);
    });
  }

  async disconnect() {
    await this.client.$disconnect();
  }
}
