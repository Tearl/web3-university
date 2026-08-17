import { expect, test } from "@playwright/test";

const apiUrl = (process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

test.describe("Stage H public release", () => {
  test("home, course and swap surfaces are reachable", async ({ page }) => {
    const course = {
      courseId: "1",
      teacher: "0x574f7d47E9748f1A45aBAa0fe9AE6f4eC8db3C4C",
      priceYD: "4000000000000000000",
      metadataUri: "ipfs://web3-university/solidity-foundations",
      status: 1,
      partial: false,
      detail: {
        courseId: "1",
        title: "Solidity 智能合约基础",
        description: "从类型、存储到测试，构建第一个可验证的智能合约。",
        coverUrl: "https://example.invalid/course-cover.jpg",
        teacherProfile: null,
      },
    };
    await page.route(/\/courses(?:\?.*)?$/, async (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ courses: [course], source: "subgraph", degraded: false, index: null }),
    }));
    await page.route(/\/courses\/1\/mixed$/, async (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        course: { ...course, lessons: [
          { id: "lesson-1", courseId: "1", title: "开发环境与第一个合约", durationSec: 150, orderIndex: 0 },
          { id: "lesson-2", courseId: "1", title: "状态变量与函数", durationSec: 150, orderIndex: 1 },
        ] },
        source: "subgraph", degraded: false, index: null,
      }),
    }));
    await page.route(/\/courses\/1\/comments(?:\?.*)?$/, async (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ comments: [], nextCursor: null }),
    }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /让每一次学习/ })).toBeVisible();
    await expect(page.getByText("Solidity 智能合约基础", { exact: true })).toBeVisible();
    await expect(page.getByText(/Sepolia 测试链 · 11155111|Anvil 本地测试链 · 31337/)).toBeVisible();

    await page.goto("/courses/1");
    await expect(page).toHaveURL(/\/courses\/1$/);
    await expect(page.getByRole("heading", { name: "Solidity 智能合约基础" })).toBeVisible();
    await expect(page.getByText("课程目录", { exact: true })).toBeVisible();

    const mobileMenu = page.getByRole("button", { name: "打开菜单" });
    if (await mobileMenu.isVisible()) await mobileMenu.click();
    await page.getByRole("link", { name: "兑换 YD" }).click();
    await expect(page).toHaveURL(/\/swap$/);
    await expect(page.getByRole("heading", { name: "兑换课程所需的 YD" })).toBeVisible();
    await expect(page.getByText("所有资产均无真实价值。", { exact: false })).toBeVisible();
  });

  test("public API reports a healthy, caught-up Subgraph", async ({ request }) => {
    const health = await request.get(`${apiUrl}/health`);
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toMatchObject({
      status: "ok",
      features: { database: true, privy: true, privyAppIdsMatch: true, fallbackOracle: true, subgraph: true },
    });

    const catalog = await request.get(`${apiUrl}/courses`);
    expect(catalog.ok()).toBeTruthy();
    const body = await catalog.json();
    expect(body).toMatchObject({
      source: "subgraph",
      degraded: false,
      index: { caughtUp: true, hasIndexingErrors: false },
    });
    expect(body.courses).toEqual(expect.arrayContaining([
      expect.objectContaining({ courseId: "1", status: 1, partial: false }),
    ]));
  });

  test("protected content rejects anonymous access", async ({ request }) => {
    const video = await request.get(`${apiUrl}/courses/1/lessons/lesson-1/video`);
    expect(video.status()).toBe(401);
    expect(await video.json()).toMatchObject({ error: { code: "access_token_required" } });

    const comment = await request.post(`${apiUrl}/courses/1/comments`, {
      data: { wallet: "0x0000000000000000000000000000000000000001", content: "anonymous" },
    });
    expect(comment.status()).toBe(401);
    expect(await comment.json()).toMatchObject({ error: { code: "access_token_required" } });
  });
});

test.describe("Stage H UI failure states", () => {
  test("shows RPC fallback, indexing lag and partial detail explicitly", async ({ page }) => {
    await page.route(/\/courses(?:\?.*)?$/, async (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        courses: [{
          courseId: "1",
          teacher: "0x574f7d47E9748f1A45aBAa0fe9AE6f4eC8db3C4C",
          priceYD: "4000000000000000000",
          metadataUri: "ipfs://course/1",
          status: 1,
          detail: null,
          partial: true,
        }],
        source: "rpc",
        degraded: true,
        index: { source: "rpc", indexedBlock: null, chainHeadBlock: "100", lagBlocks: null, caughtUp: false, hasIndexingErrors: false },
      }),
    }));

    await page.goto("/");
    await expect(page.getByText(/Subgraph 暂不可用，当前使用 RPC 降级数据/)).toBeVisible();
    await expect(page.getByText(/部分课程的链下详情尚未同步/)).toBeVisible();
  });

  test("shows a safe error when the catalog is unavailable", async ({ page }) => {
    await page.route(/\/courses(?:\?.*)?$/, async (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "course_index_unavailable" } }),
    }));
    await page.goto("/");
    await expect(page.getByText(/暂时无法读取链上课程/)).toBeVisible();
  });

  test("does not turn an unknown course into a fake course", async ({ page }) => {
    await page.route(/\/courses\/999\/mixed$/, async (route) => route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "course_not_found" } }),
    }));
    await page.goto("/courses/999");
    await expect(page.getByText(/链上不存在这门课程。/)).toBeVisible();
  });
});
