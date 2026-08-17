import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createEvidenceHash, validateProgressWindow } from "../src/learning-repository.js";
import type { CourseProgressRecord, FallbackOracleSigner, LearningRepository, OracleChainService, OracleEvidenceRecord } from "../src/types.js";
import { MemoryCommentRepository, MemoryCourseIndex, MemoryCourseRepository, MemoryProfileRepository, purchasedWallet } from "./helpers.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

class MemoryLearningRepository implements LearningRepository {
  evidence: OracleEvidenceRecord | null = null;
  updateStatus: "updated" | "progress_jump_too_large" = "updated";
  nonces = new Map<string, { wallet: string; courseId: bigint; expiresAt: Date; used: boolean }>();
  progress: CourseProgressRecord = {
    courseId: 1n, title: "Solidity", coverUrl: "https://example.com/cover.png",
    watchedSeconds: 0, durationSec: 30, progress: 0,
    lessons: [{ lessonId: "lesson-1", title: "Storage", durationSec: 30, watchedSeconds: 0, completed: false, updatedAt: null }],
    evidence: null,
  };
  async getCourseProgress() { return this.progress; }
  async listLearning() { return this.progress.watchedSeconds ? [this.progress] : []; }
  async recordProgress(input: Parameters<LearningRepository["recordProgress"]>[0]) {
    if (this.updateStatus !== "updated") return { status: this.updateStatus } as const;
    const watched = Math.min(input.watchedSeconds, 30);
    if (watched === 30 && !this.evidence) {
      this.evidence = { wallet: input.wallet, courseId: 1n, progress: 100, evidenceHash: `0x${"ab".repeat(32)}`, tokenUri: `http://localhost:4000/certificates/metadata/0x${"ab".repeat(32)}`, issuedAt: input.now };
    }
    this.progress = { ...this.progress, watchedSeconds: watched, progress: Math.floor(watched * 100 / 30), evidence: this.evidence, lessons: [{ ...this.progress.lessons[0]!, watchedSeconds: watched, completed: watched === 30, updatedAt: input.now }] };
    return { status: "updated", progress: this.progress } as const;
  }
  async findEvidence(wallet: string, courseId: bigint) { return this.evidence?.wallet === wallet && this.evidence.courseId === courseId ? this.evidence : null; }
  async findEvidenceByHash(hash: string) { return this.evidence?.evidenceHash === hash ? this.evidence : null; }
  async createOracleNonce(input: { wallet: string; courseId: bigint; nonce: string; expiresAt: Date }) { this.nonces.set(input.nonce, { ...input, used: false }); }
  async countRecentOracleNonces() { return this.nonces.size; }
  async consumeOracleNonce(input: { wallet: string; courseId: bigint; nonce: string; expiresAt: Date; now: Date }) {
    const record = this.nonces.get(input.nonce);
    if (!record || record.used || record.wallet !== input.wallet || record.courseId !== input.courseId || record.expiresAt.getTime() !== input.expiresAt.getTime() || record.expiresAt <= input.now) return false;
    record.used = true; return true;
  }
  async disconnect() {}
}

class MemoryOracleChain implements OracleChainService {
  certificate: { tokenId: bigint; tokenUri: string } | null = null;
  request = { student: purchasedWallet, courseId: 1n, fulfilled: false, status: 1 };
  async getCertificate() { return this.certificate; }
  async getRequest(requestId: bigint) { return requestId === 1n ? this.request : null; }
  async fulfill(input: { requestId: bigint; evidenceHash: string; tokenUri: string }) {
    this.request.fulfilled = true; this.certificate = { tokenId: 1n, tokenUri: input.tokenUri };
    return `0x${"cd".repeat(32)}` as `0x${string}`;
  }
}

function setup(hasPurchased = true, fallbackOracleSigner: FallbackOracleSigner | null = null) {
  const learning = new MemoryLearningRepository();
  const oracleChain = new MemoryOracleChain();
  const app = createApp({
    courses: new MemoryCourseRepository(), courseIndex: new MemoryCourseIndex(), comments: new MemoryCommentRepository(),
    profiles: new MemoryProfileRepository(), learning, oracleChain, oracleApiKey: "oracle-test-key", fallbackOracleSigner,
    purchases: { hasPurchased: async () => hasPurchased },
    identities: { verify: async () => ({ privyDid: "did:privy:student", wallets: [purchasedWallet] }) },
    courseRoles: { isTeacher: async () => false, isReviewer: async () => false },
    now: () => new Date("2026-08-14T10:00:00.000Z"),
  });
  apps.push(app);
  return { app, learning, oracleChain };
}

describe("progress time window", () => {
  const now = new Date("2026-08-14T10:00:00.000Z");
  it("blocks initial and repeated instant jumps", () => {
    expect(validateProgressWindow({ requested: 31, current: 0, startedAt: null, updatedAt: null, now, initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60 })).toBe("progress_jump_too_large");
    expect(validateProgressWindow({ requested: 30, current: 0, startedAt: null, updatedAt: null, now, initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60 })).toBe("allowed");
    expect(validateProgressWindow({ requested: 40, current: 30, startedAt: now, updatedAt: now, now, initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60 })).toBe("progress_jump_too_large");
  });
  it("allows elapsed viewing time but caps a single update", () => {
    const later = new Date(now.getTime() + 20_000);
    expect(validateProgressWindow({ requested: 50, current: 30, startedAt: now, updatedAt: now, now: later, initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60 })).toBe("allowed");
    const muchLater = new Date(now.getTime() + 1_000_000);
    expect(validateProgressWindow({ requested: 120, current: 50, startedAt: now, updatedAt: now, now: muchLater, initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60 })).toBe("progress_jump_too_large");
  });
  it("creates deterministic evidence hashes", () => {
    expect(createEvidenceHash({ a: 1 })).toBe(createEvidenceHash({ a: 1 }));
    expect(createEvidenceHash({ a: 1 })).not.toBe(createEvidenceHash({ a: 2 }));
  });
});

describe("purchased learning and local certificate flow", () => {
  it("returns indexed wallet purchases and sync status with learning data", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "GET",
      url: "/learning",
      headers: { authorization: "Bearer valid", "x-wallet-address": purchasedWallet },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      purchases: [{ courseId: "1", priceYD: "4000000000000000000" }],
      certificates: [],
      source: "subgraph",
      degraded: false,
      index: { indexedBlock: "100", chainHeadBlock: "100", caughtUp: true },
    });
  });

  it("requires Privy identity, linked wallet and on-chain purchase", async () => {
    const { app } = setup(false);
    expect((await app.inject({ method: "PATCH", url: "/courses/1/lessons/lesson-1/progress", payload: { wallet: purchasedWallet, watchedSeconds: 10 } })).statusCode).toBe(401);
    const forbidden = await app.inject({ method: "PATCH", url: "/courses/1/lessons/lesson-1/progress", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, watchedSeconds: 10 } });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe("course_not_purchased");
  });

  it("maps anti-cheat failures and creates evidence only at 100 percent", async () => {
    const { app, learning } = setup();
    learning.updateStatus = "progress_jump_too_large";
    const jump = await app.inject({ method: "PATCH", url: "/courses/1/lessons/lesson-1/progress", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, watchedSeconds: 30 } });
    expect(jump.statusCode).toBe(409);
    learning.updateStatus = "updated";
    const completed = await app.inject({ method: "PATCH", url: "/courses/1/lessons/lesson-1/progress", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, watchedSeconds: 30 } });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().progress).toMatchObject({ progress: 100, evidence: { progress: 100 } });
  });

  it("protects Oracle evidence with API key, expiry and one-time nonce", async () => {
    const { app, learning } = setup();
    await learning.recordProgress({ privyDid: "did:privy:student", wallet: purchasedWallet, courseId: 1n, lessonId: "lesson-1", watchedSeconds: 30, now: new Date("2026-08-14T10:00:00.000Z"), initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60, publicApiUrl: "http://localhost:4000" });
    expect((await app.inject({ method: "POST", url: "/oracle/challenge", payload: { wallet: purchasedWallet, courseId: "1" } })).statusCode).toBe(401);
    const challenge = await app.inject({ method: "POST", url: "/oracle/challenge", headers: { "x-oracle-key": "oracle-test-key" }, payload: { wallet: purchasedWallet, courseId: "1" } });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.headers["cache-control"]).toBe("no-store");
    const { nonce, expiresAt } = challenge.json();
    const url = `/oracle/completion?wallet=${purchasedWallet}&courseId=1&nonce=${nonce}&expiresAt=${expiresAt}`;
    const result = await app.inject({ method: "GET", url, headers: { "x-oracle-key": "oracle-test-key" } });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.json()).toMatchObject({ completed: true, evidenceHash: `0x${"ab".repeat(32)}` });
    expect((await app.inject({ method: "GET", url, headers: { "x-oracle-key": "oracle-test-key" } })).statusCode).toBe(409);
  });

  it("does not issue an Oracle challenge when completion evidence is absent", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/oracle/challenge",
      headers: { "x-oracle-key": "oracle-test-key" },
      payload: { wallet: purchasedWallet, courseId: "1" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("evidence_not_found");
  });

  it("serves metadata and fulfills a matching chain request once", async () => {
    const { app, learning, oracleChain } = setup();
    await learning.recordProgress({ privyDid: "did:privy:student", wallet: purchasedWallet, courseId: 1n, lessonId: "lesson-1", watchedSeconds: 30, now: new Date("2026-08-14T10:00:00.000Z"), initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60, publicApiUrl: "http://localhost:4000" });
    const metadata = await app.inject({ method: "GET", url: `/certificates/metadata/0x${"ab".repeat(32)}` });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toMatchObject({ name: "Web3 University · Solidity", attributes: expect.any(Array) });
    const fulfilled = await app.inject({ method: "POST", url: "/oracle/local/fulfill", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, courseId: "1", requestId: "1" } });
    expect(fulfilled.statusCode).toBe(200);
    expect(fulfilled.json().certificate.tokenId).toBe("1");
    expect(oracleChain.request.fulfilled).toBe(true);
    const duplicate = await app.inject({ method: "POST", url: "/oracle/local/fulfill", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, courseId: "1", requestId: "1" } });
    expect(duplicate.statusCode).toBe(409);
  });

  it("issues a request-bound EIP-712 fallback attestation to the linked student", async () => {
    let signed: Parameters<FallbackOracleSigner["signCompletion"]>[0] | undefined;
    const fallbackSigner: FallbackOracleSigner = {
      address: "0x00000000000000000000000000000000000000F1",
      async signCompletion(input) {
        signed = input;
        return `0x${"12".repeat(65)}`;
      },
    };
    const { app, learning } = setup(true, fallbackSigner);
    await learning.recordProgress({ privyDid: "did:privy:student", wallet: purchasedWallet, courseId: 1n, lessonId: "lesson-1", watchedSeconds: 30, now: new Date("2026-08-14T10:00:00.000Z"), initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60, publicApiUrl: "http://localhost:4000" });

    const response = await app.inject({
      method: "POST",
      url: "/oracle/fallback/attestation",
      headers: { authorization: "Bearer valid" },
      payload: { wallet: purchasedWallet, courseId: "1", requestId: "1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      requestId: "1",
      student: purchasedWallet,
      courseId: "1",
      evidenceHash: `0x${"ab".repeat(32)}`,
      deadline: "1786701900",
      signer: fallbackSigner.address,
      signature: `0x${"12".repeat(65)}`,
    });
    expect(signed).toMatchObject({ requestId: 1n, student: purchasedWallet, courseId: 1n });
  });

  it("rejects fallback signing when disabled, unlinked, mismatched, or not pending", async () => {
    const disabled = setup();
    const unavailable = await disabled.app.inject({
      method: "POST", url: "/oracle/fallback/attestation",
      headers: { authorization: "Bearer valid" },
      payload: { wallet: purchasedWallet, courseId: "1", requestId: "1" },
    });
    expect(unavailable.statusCode).toBe(503);

    const fallbackSigner: FallbackOracleSigner = {
      address: "0x00000000000000000000000000000000000000F1",
      async signCompletion() { return `0x${"12".repeat(65)}`; },
    };
    const enabled = setup(true, fallbackSigner);
    await enabled.learning.recordProgress({ privyDid: "did:privy:student", wallet: purchasedWallet, courseId: 1n, lessonId: "lesson-1", watchedSeconds: 30, now: new Date("2026-08-14T10:00:00.000Z"), initialAllowanceSeconds: 30, graceSeconds: 10, maxDeltaSeconds: 60, publicApiUrl: "http://localhost:4000" });

    const unlinked = await enabled.app.inject({
      method: "POST", url: "/oracle/fallback/attestation",
      headers: { authorization: "Bearer valid" },
      payload: { wallet: "0x0000000000000000000000000000000000000002", courseId: "1", requestId: "1" },
    });
    expect(unlinked.statusCode).toBe(403);

    enabled.oracleChain.request.status = 4;
    const stale = await enabled.app.inject({
      method: "POST", url: "/oracle/fallback/attestation",
      headers: { authorization: "Bearer valid" },
      payload: { wallet: purchasedWallet, courseId: "1", requestId: "1" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("oracle_request_not_pending");
  });
});
