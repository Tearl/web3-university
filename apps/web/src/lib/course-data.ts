export interface PublicLesson {
  id: string;
  courseId: string;
  title: string;
  durationSec: number;
  orderIndex: number;
}

export interface CourseDetail {
  courseId: string;
  title: string;
  description: string;
  coverUrl: string;
  teacherProfile: unknown;
}

export interface MixedCourse {
  courseId: string;
  teacher: `0x${string}`;
  priceYD: string;
  metadataUri: string;
  status: number;
  detail: CourseDetail | null;
  partial: boolean;
  lessons?: PublicLesson[];
}

export interface CourseCatalogResponse {
  courses: MixedCourse[];
  source: "subgraph" | "rpc";
  degraded: boolean;
  index: IndexSyncStatus | null;
}

export interface MixedCourseResponse {
  course: MixedCourse & { lessons: PublicLesson[] };
  source: "subgraph" | "rpc";
  degraded: boolean;
  index: IndexSyncStatus | null;
}

export interface IndexSyncStatus {
  source: "subgraph" | "rpc";
  indexedBlock: string | null;
  chainHeadBlock: string;
  lagBlocks: string | null;
  caughtUp: boolean;
  hasIndexingErrors: boolean;
}

export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟` : `${(minutes / 60).toFixed(1)} 小时`;
}

export function teacherName(course: MixedCourse) {
  const profile = course.detail?.teacherProfile;
  if (profile && typeof profile === "object" && "name" in profile && typeof profile.name === "string") return profile.name;
  return "链上教师";
}

export function courseAccent(courseId: string): "violet" | "cyan" | "amber" {
  return (["violet", "cyan", "amber"] as const)[Number(BigInt(courseId) % 3n)] ?? "violet";
}
