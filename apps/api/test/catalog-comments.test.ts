import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryCommentRepository, MemoryCourseIndex, MemoryCourseRepository, MemoryProfileRepository, purchasedWallet } from "./helpers.js";

const apps: ReturnType<typeof createApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup() {
  const courses = new MemoryCourseRepository();
  const courseIndex = new MemoryCourseIndex();
  const comments = new MemoryCommentRepository();
  const app = createApp({
    courses,
    courseIndex,
    comments,
    profiles: new MemoryProfileRepository(),
    purchases: { hasPurchased: async () => false },
    identities: { verify: async () => ({ privyDid: "did:privy:student", wallets: [purchasedWallet] }) },
    courseRoles: { isTeacher: async () => false, isReviewer: async () => true },
  });
  apps.push(app);
  return { app, courses, courseIndex, comments };
}

describe("mixed course catalog", () => {
  it("merges active indexed courses with database details by course id", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/courses" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: "subgraph", degraded: false });
    expect(response.json().courses[0]).toMatchObject({ courseId: "1", status: 1, partial: false, detail: { title: "Solidity" } });
  });

  it("returns partial records without inventing missing database content", async () => {
    const { app, courseIndex } = setup();
    courseIndex.records.set(2n, { courseId: 2n, teacher: purchasedWallet, priceYD: 5n, metadataUri: "urn:course:2", status: 1 });
    courseIndex.source = "rpc";
    courseIndex.degraded = true;
    const response = await app.inject({ method: "GET", url: "/courses" });
    expect(response.json()).toMatchObject({ source: "rpc", degraded: true });
    expect(response.json().courses[1]).toMatchObject({ courseId: "2", detail: null, partial: true });
  });

  it("supports bounded batch detail queries", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/courses?ids=1,2" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: "database", courses: [{ courseId: "1" }] });
    expect((await app.inject({ method: "GET", url: "/courses?ids=1,nope" })).statusCode).toBe(400);
  });
});

describe("course comments", () => {
  it("requires Privy authentication to publish", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "POST", url: "/courses/1/comments", payload: { wallet: purchasedWallet, content: "很好" } });
    expect(response.statusCode).toBe(401);
  });

  it("publishes escaped-as-text content for a linked wallet and paginates visible comments", async () => {
    const { app } = setup();
    const created = await app.inject({
      method: "POST", url: "/courses/1/comments", headers: { authorization: "Bearer valid" },
      payload: { wallet: purchasedWallet, content: "<script>alert(1)</script> 很好" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().comment).toMatchObject({ content: "<script>alert(1)</script> 很好", author: { username: "student" } });
    const listed = await app.inject({ method: "GET", url: "/courses/1/comments?limit=1" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().comments).toHaveLength(1);
  });

  it("rejects unlinked wallets, blank content and rate limit abuse", async () => {
    const { app, comments } = setup();
    expect((await app.inject({
      method: "POST", url: "/courses/1/comments", headers: { authorization: "Bearer valid" },
      payload: { wallet: "0x0000000000000000000000000000000000000002", content: "hello" },
    })).statusCode).toBe(403);
    expect((await app.inject({
      method: "POST", url: "/courses/1/comments", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, content: "   " },
    })).statusCode).toBe(400);
    for (let index = 0; index < 5; index += 1) {
      comments.comments.push({
        id: `recent-${index}`, courseId: 1n, content: "recent", status: "VISIBLE", createdAt: new Date(),
        username: "student", walletAddress: purchasedWallet,
      });
    }
    const limited = await app.inject({
      method: "POST", url: "/courses/1/comments", headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, content: "too many" },
    });
    expect(limited.statusCode).toBe(429);
  });

  it("allows only an on-chain reviewer to soft-hide a comment", async () => {
    const { app, comments } = setup();
    comments.comments.push({
      id: "comment-to-hide", courseId: 1n, content: "spam", status: "VISIBLE", createdAt: new Date(),
      username: "student", walletAddress: purchasedWallet,
    });
    const hidden = await app.inject({
      method: "PATCH", url: "/courses/1/comments/comment-to-hide",
      headers: { authorization: "Bearer valid" }, payload: { wallet: purchasedWallet, action: "hide" },
    });
    expect(hidden.statusCode).toBe(200);
    expect(comments.comments[0]?.status).toBe("HIDDEN");
    const listed = await app.inject({ method: "GET", url: "/courses/1/comments" });
    expect(listed.json().comments).toHaveLength(0);
  });
});
