import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryCourseRepository, MemoryProfileRepository } from "./helpers.js";

describe("health", () => {
  it("returns service status", async () => {
    const courses = new MemoryCourseRepository();
    const app = createApp({
      courses,
      purchases: { hasPurchased: async () => false },
      profiles: new MemoryProfileRepository(),
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
    await app.close();
    expect(courses.disconnected).toBe(true);
  });
});
