import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { CourseSubmissionReceipt } from "../src/types.js";
import { MemoryCourseRepository, MemoryProfileRepository, purchasedWallet } from "./helpers.js";

const apps: ReturnType<typeof createApp>[] = [];
const transactionHash = `0x${"ab".repeat(32)}` as `0x${string}`;

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(options: { teacher?: boolean; receipt?: CourseSubmissionReceipt } = {}) {
  const courses = new MemoryCourseRepository();
  const app = createApp({
    courses,
    purchases: { hasPurchased: async () => false },
    identities: { verify: async () => ({ privyDid: "did:privy:teacher", wallets: [purchasedWallet] }) },
    profiles: new MemoryProfileRepository(),
    courseRoles: { isTeacher: async () => options.teacher ?? true, isReviewer: async () => true },
    courseSubmissions: { verify: async () => options.receipt ?? Promise.reject(new Error("receipt missing")) },
  });
  apps.push(app);
  return { app, courses };
}

const payload = {
  wallet: purchasedWallet,
  title: "Solidity 实战",
  description: "从存储布局到可升级合约的完整课程。",
  coverUrl: "https://example.com/solidity.png",
  priceYD: "4",
  lessons: [{ title: "Storage", videoKey: "course/storage.mp4", durationSec: 600, orderIndex: 0 }],
};

async function createDraft(app: ReturnType<typeof createApp>) {
  return app.inject({ method: "POST", url: "/teacher/drafts", headers: { authorization: "Bearer valid" }, payload });
}

describe("teacher course workflow", () => {
  it("requires a linked Privy identity and a chain teacher role", async () => {
    const { app } = setup({ teacher: false });
    expect((await app.inject({ method: "POST", url: "/teacher/drafts", payload })).statusCode).toBe(401);
    const forbidden = await createDraft(app);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe("teacher_role_required");
  });

  it("saves a retryable off-chain draft without inventing a course id", async () => {
    const { app } = setup();
    const response = await createDraft(app);
    expect(response.statusCode).toBe(201);
    expect(response.json().draft).toMatchObject({ status: "DRAFT", courseId: null, priceYD: "4000000000000000000" });
    expect(response.json().draft.metadataUri).toMatch(/^urn:web3-university:course:[a-f0-9]{64}$/);
  });

  it("rejects a transaction event that does not match the draft", async () => {
    const { app } = setup({ receipt: { courseId: 7n, teacher: purchasedWallet, priceYD: 5n, metadataUri: "wrong" } });
    const created = await createDraft(app);
    const response = await app.inject({
      method: "POST", url: `/teacher/drafts/${created.json().draft.id}/submit`,
      headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, transactionHash },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("course_submission_mismatch");
  });

  it("binds the emitted course id and publishes details only after confirmation", async () => {
    const { app, courses } = setup();
    const created = await createDraft(app);
    const draft = created.json().draft;
    await app.close();
    apps.splice(apps.indexOf(app), 1);

    const confirmedApp = createApp({
      courses,
      purchases: { hasPurchased: async () => false },
      identities: { verify: async () => ({ privyDid: "did:privy:teacher", wallets: [purchasedWallet] }) },
      profiles: new MemoryProfileRepository(),
      courseRoles: { isTeacher: async () => true, isReviewer: async () => true },
      courseSubmissions: { verify: async () => ({
        courseId: 7n, teacher: purchasedWallet, priceYD: 4_000_000_000_000_000_000n, metadataUri: draft.metadataUri,
      }) },
    });
    apps.push(confirmedApp);
    const response = await confirmedApp.inject({
      method: "POST", url: `/teacher/drafts/${draft.id}/submit`,
      headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, transactionHash },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().draft).toMatchObject({ status: "SUBMITTED", courseId: "7", transactionHash });
    expect(await courses.findCourse(7n)).toMatchObject({ title: payload.title });
    expect(await courses.listLessons(7n)).toHaveLength(1);
  });
});
