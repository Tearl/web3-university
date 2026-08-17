export interface CourseRecord {
  courseId: bigint;
  title: string;
  description: string;
  coverUrl: string;
  teacherProfile: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonRecord {
  id: string;
  courseId: bigint;
  title: string;
  videoKey: string;
  durationSec: number;
  orderIndex: number;
}

export interface CreateCourseInput {
  courseId: bigint;
  title: string;
  description: string;
  coverUrl: string;
  teacherProfile?: unknown;
}

export interface CreateLessonInput {
  courseId: bigint;
  title: string;
  videoKey: string;
  durationSec: number;
  orderIndex: number;
}

export interface CourseDraftLesson {
  title: string;
  videoKey: string;
  durationSec: number;
  orderIndex: number;
}

export interface CourseDraftRecord {
  id: string;
  privyDid: string;
  teacherWallet: string;
  title: string;
  description: string;
  coverUrl: string;
  teacherProfile: unknown;
  metadataUri: string;
  priceYD: string;
  lessons: CourseDraftLesson[];
  status: "DRAFT" | "SUBMITTED";
  courseId: bigint | null;
  transactionHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCourseDraftInput {
  privyDid: string;
  teacherWallet: string;
  title: string;
  description: string;
  coverUrl: string;
  teacherProfile?: unknown;
  metadataUri: string;
  priceYD: string;
  lessons: CourseDraftLesson[];
}

export interface SubmitCourseDraftInput {
  id: string;
  privyDid: string;
  teacherWallet: string;
  courseId: bigint;
  transactionHash: string;
}

export interface CourseRepository {
  findCourse(courseId: bigint): Promise<CourseRecord | null>;
  listCourses(courseIds: bigint[]): Promise<CourseRecord[]>;
  listLessons(courseId: bigint): Promise<LessonRecord[]>;
  findLesson(courseId: bigint, lessonId: string): Promise<LessonRecord | null>;
  upsertCourse(input: CreateCourseInput): Promise<CourseRecord>;
  upsertLesson(input: CreateLessonInput): Promise<LessonRecord>;
  createDraft(input: CreateCourseDraftInput): Promise<CourseDraftRecord>;
  listDrafts(privyDid: string, wallet: string): Promise<CourseDraftRecord[]>;
  findDraft(id: string): Promise<CourseDraftRecord | null>;
  submitDraft(input: SubmitCourseDraftInput): Promise<CourseDraftRecord | null>;
  disconnect(): Promise<void>;
}

export interface ChainCourseRecord {
  courseId: bigint;
  teacher: `0x${string}`;
  priceYD: bigint;
  metadataUri: string;
  status: number;
}

export interface CourseIndexResult {
  courses: ChainCourseRecord[];
  source: "subgraph" | "rpc";
  degraded: boolean;
  index?: IndexSyncStatus;
}

export interface IndexSyncStatus {
  source: "subgraph" | "rpc";
  indexedBlock: bigint | null;
  chainHeadBlock: bigint;
  lagBlocks: bigint | null;
  caughtUp: boolean;
  hasIndexingErrors: boolean;
}

export interface IndexedPurchaseRecord {
  id: string;
  courseId: bigint;
  buyer: `0x${string}`;
  priceYD: bigint;
  purchasedAt: bigint;
  transactionHash: `0x${string}`;
}

export interface IndexedCertificateRecord {
  tokenId: bigint;
  courseId: bigint;
  student: `0x${string}`;
  tokenUri: string;
  issuedAt: bigint;
  transactionHash: `0x${string}`;
}

export interface WalletActivityResult {
  purchases: IndexedPurchaseRecord[];
  certificates: IndexedCertificateRecord[];
  source: "subgraph" | "rpc";
  degraded: boolean;
  index: IndexSyncStatus;
}

export interface CourseIndex {
  listActiveCourses(): Promise<CourseIndexResult>;
  findCourse(courseId: bigint): Promise<{ course: ChainCourseRecord | null; source: "subgraph" | "rpc"; degraded: boolean; index?: IndexSyncStatus }>;
  listWalletActivity(wallet: `0x${string}`): Promise<WalletActivityResult>;
}

export interface CommentRecord {
  id: string;
  courseId: bigint;
  content: string;
  status: "VISIBLE" | "HIDDEN" | "PENDING";
  createdAt: Date;
  username: string | null;
  walletAddress: string;
}

export interface CommentRepository {
  listComments(courseId: bigint, cursor: string | undefined, limit: number): Promise<{ comments: CommentRecord[]; nextCursor: string | null }>;
  countRecentComments(privyDid: string, since: Date): Promise<number>;
  createComment(input: { courseId: bigint; privyDid: string; wallet: string; content: string }): Promise<CommentRecord>;
  hideComment(id: string): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface CourseSubmissionReceipt {
  courseId: bigint;
  teacher: `0x${string}`;
  priceYD: bigint;
  metadataUri: string;
}

export interface CourseSubmissionVerifier {
  verify(transactionHash: `0x${string}`): Promise<CourseSubmissionReceipt>;
}

export interface CourseRoleVerifier {
  isTeacher(wallet: `0x${string}`): Promise<boolean>;
  isReviewer(wallet: `0x${string}`): Promise<boolean>;
}

export interface PurchaseVerifier {
  hasPurchased(wallet: `0x${string}`, courseId: bigint): Promise<boolean>;
}

export interface AuthenticatedIdentity {
  privyDid: string;
  wallets: `0x${string}`[];
}

export interface IdentityVerifier {
  verify(accessToken: string): Promise<AuthenticatedIdentity>;
}

export interface ProfileRecord {
  privyDid: string;
  walletAddress: string;
  username: string | null;
}

export interface ProfileNonceRecord {
  privyDid: string;
  wallet: string;
  username: string;
  chainId: number;
  nonce: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface CreateProfileNonceInput {
  privyDid: string;
  wallet: string;
  username: string;
  chainId: number;
  nonce: string;
  expiresAt: Date;
}

export type ConsumeProfileNonceResult = "updated" | "invalid_or_used";

export interface ProfileRepository {
  findProfile(privyDid: string): Promise<ProfileRecord | null>;
  createNonce(input: CreateProfileNonceInput): Promise<ProfileNonceRecord>;
  findNonce(nonce: string): Promise<ProfileNonceRecord | null>;
  consumeNonceAndUpdateProfile(input: CreateProfileNonceInput, now: Date): Promise<ConsumeProfileNonceResult>;
  disconnect(): Promise<void>;
}

export interface LessonProgressRecord {
  lessonId: string;
  title: string;
  durationSec: number;
  watchedSeconds: number;
  completed: boolean;
  updatedAt: Date | null;
}

export interface CourseProgressRecord {
  courseId: bigint;
  title: string;
  coverUrl: string;
  watchedSeconds: number;
  durationSec: number;
  progress: number;
  lessons: LessonProgressRecord[];
  evidence: OracleEvidenceRecord | null;
}

export interface OracleEvidenceRecord {
  wallet: string;
  courseId: bigint;
  progress: number;
  evidenceHash: string;
  tokenUri: string;
  issuedAt: Date;
}

export type RecordProgressResult =
  | { status: "updated"; progress: CourseProgressRecord }
  | { status: "course_not_found" | "lesson_not_found" | "progress_regression" | "progress_jump_too_large" };

export interface LearningRepository {
  getCourseProgress(privyDid: string, courseId: bigint): Promise<CourseProgressRecord | null>;
  listLearning(privyDid: string): Promise<CourseProgressRecord[]>;
  recordProgress(input: {
    privyDid: string;
    wallet: string;
    courseId: bigint;
    lessonId: string;
    watchedSeconds: number;
    now: Date;
    initialAllowanceSeconds: number;
    graceSeconds: number;
    maxDeltaSeconds: number;
    publicApiUrl: string;
  }): Promise<RecordProgressResult>;
  findEvidence(wallet: string, courseId: bigint): Promise<OracleEvidenceRecord | null>;
  findEvidenceByHash(evidenceHash: string): Promise<OracleEvidenceRecord | null>;
  createOracleNonce(input: { wallet: string; courseId: bigint; nonce: string; expiresAt: Date }): Promise<void>;
  countRecentOracleNonces(since: Date): Promise<number>;
  consumeOracleNonce(input: { wallet: string; courseId: bigint; nonce: string; expiresAt: Date; now: Date }): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface CertificateStatus {
  tokenId: bigint;
  tokenUri: string | null;
}

export interface OracleChainService {
  getCertificate(wallet: `0x${string}`, courseId: bigint): Promise<CertificateStatus | null>;
  getRequest(requestId: bigint): Promise<{ student: `0x${string}`; courseId: bigint; fulfilled: boolean; status: number } | null>;
  fulfill(input: { requestId: bigint; evidenceHash: string; tokenUri: string }): Promise<`0x${string}`>;
}

export interface FallbackOracleSigner {
  address: `0x${string}`;
  signCompletion(input: {
    requestId: bigint;
    student: `0x${string}`;
    courseId: bigint;
    evidenceHash: `0x${string}`;
    tokenUri: string;
    deadline: bigint;
  }): Promise<`0x${string}`>;
}
