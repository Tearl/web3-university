import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryCourseRepository, MemoryProfileRepository, purchasedWallet } from "./helpers.js";

const apps: ReturnType<typeof createApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(hasPurchased = false) {
  const courses = new MemoryCourseRepository();
  const app = createApp({
    courses,
    purchases: { hasPurchased: async () => hasPurchased },
    identities: { verify: async () => ({ privyDid: "did:privy:student", wallets: [purchasedWallet] }) },
    profiles: new MemoryProfileRepository(),
    allowDevelopmentWrites: true,
  });
  apps.push(app);
  return { app, courses };
}

describe("course content API", () => {
  it("returns a course with BigInt serialized as a string", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/courses/1" });
    expect(response.statusCode).toBe(200);
    expect(response.json().course).toMatchObject({ courseId: "1", title: "Solidity" });
  });

  it("rejects invalid ids and reports missing courses", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/courses/nope" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/courses/999" })).statusCode).toBe(404);
  });

  it("lists lessons without exposing the storage video key", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/courses/1/lessons" });
    expect(response.statusCode).toBe(200);
    expect(response.json().lessons[0]).toMatchObject({ courseId: "1", id: "lesson-1" });
    expect(response.body).not.toContain("videoKey");
  });

  it("keeps development writes behind the teacher key", async () => {
    const { app } = setup();
    const payload = { title: "New", description: "New course", coverUrl: "https://example.com/new.png" };
    const forbidden = await app.inject({ method: "PUT", url: "/dev/courses/2", payload });
    expect(forbidden.statusCode).toBe(403);

    const accepted = await app.inject({
      method: "PUT",
      url: "/dev/courses/2",
      headers: { "x-dev-teacher-key": "local-teacher-key" },
      payload,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().course.courseId).toBe("2");
  });

  it("disables development writes outside the development environment", async () => {
    const courses = new MemoryCourseRepository();
    const app = createApp({
      courses,
      purchases: { hasPurchased: async () => false },
      profiles: new MemoryProfileRepository(),
      allowDevelopmentWrites: false,
    });
    apps.push(app);
    const response = await app.inject({
      method: "PUT",
      url: "/dev/courses/2",
      headers: { "x-dev-teacher-key": "local-teacher-key" },
      payload: { title: "New", description: "New course", coverUrl: "https://example.com/new.png" },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("protected video API", () => {
  it("requires a Privy access token", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/courses/1/lessons/lesson-1/video" })).statusCode).toBe(401);
  });

  it("returns 403 when the chain says the wallet has not purchased", async () => {
    const { app } = setup(false);
    const response = await app.inject({
      method: "GET",
      url: "/courses/1/lessons/lesson-1/video",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("course_not_purchased");
  });

  it("returns a short-lived signed URL for a purchased course", async () => {
    const { app } = setup(true);
    const response = await app.inject({
      method: "GET",
      url: "/courses/1/lessons/lesson-1/video",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().video.url).toMatch(/storage\.mp4\?expires=\d+&signature=[a-f0-9]{64}$/);
    expect(response.json().video.expiresAt).toBeTruthy();
  });

  it("returns 404 before querying purchase state for an unknown lesson", async () => {
    const { app } = setup(true);
    const response = await app.inject({
      method: "GET",
      url: "/courses/1/lessons/missing/video",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("maps RPC failures to service unavailable", async () => {
    const courses = new MemoryCourseRepository();
    const app = createApp({
      courses,
      purchases: { hasPurchased: async () => { throw new Error("rpc down"); } },
      identities: { verify: async () => ({ privyDid: "did:privy:student", wallets: [purchasedWallet] }) },
      profiles: new MemoryProfileRepository(),
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/courses/1/lessons/lesson-1/video",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("chain_unavailable");
  });
});
