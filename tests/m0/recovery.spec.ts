import { expect, test, type Page } from "@playwright/test";

test("startup waits for an ordinary refresh without reporting another tab's logout", async ({
  page,
  context,
}) => {
  let releaseRefresh!: () => void;
  let refreshStarted!: () => void;
  const heldRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const started = new Promise<void>((resolve) => {
    refreshStarted = resolve;
  });
  await page.route("**/api/v1/auth/refresh", async (route) => {
    refreshStarted();
    await heldRefresh;
    await route.continue();
  });
  await page.goto("/");
  await started;
  const peer = await context.newPage();
  await peer.goto("/");
  try {
    await expect
      .poll(() =>
        peer.evaluate(async () => {
          const locks = await navigator.locks.query();
          return locks.pending?.some((lock) => lock.name?.startsWith("sazeh-m1a-lifecycle-"));
        }),
      )
      .toBe(true);
  } finally {
    releaseRefresh();
  }
  await expect(peer.getByLabel("نام کاربری")).toBeVisible();
  await expect(
    peer.getByText(
      "تعیین تکلیف خروج در برگهٔ دیگری باز است. پس از بسته‌شدن آن، اینجا را دوباره بررسی کنید.",
    ),
  ).toHaveCount(0);
});

test("reloading a peer tab during a sync recovers the single pending command", async ({
  page,
  context,
}) => {
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const marker = `M1A_BROWSER_RELOAD::${requiredEnv("M1A_TEST_RUN_ID")}`;
  const posts = new Map<string, number>();

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("گذرواژه", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByLabel("متن یادداشت")).toBeVisible();

  const peer = await context.newPage();
  await peer.goto("/");
  await expect(peer.getByLabel("متن یادداشت")).toBeVisible();
  context.on("request", (request) => {
    if (request.url().endsWith("/api/v1/drafts") && request.method() === "POST") {
      const body = request.postDataJSON() as { text?: unknown } | null;
      if (body?.text === marker) posts.set(marker, (posts.get(marker) ?? 0) + 1);
    }
  });

  await context.setOffline(true);
  await page.getByLabel("متن یادداشت").fill(marker);
  await page.getByRole("button", { name: "ذخیرهٔ یادداشت" }).click();
  await expect(page.getByText(marker)).toBeVisible();
  await page.reload();
  await expect(page.getByText(marker)).toBeVisible();
  await peer.reload();
  await expect(peer.getByText(marker)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("همگام شد")).toBeVisible();
  expect(posts.get(marker)).toBe(1);
  await expect(peer.getByText("همگام شد")).toBeVisible();

  await peer.reload();
  await expect(peer.getByText("همگام شد")).toBeVisible();
});

test("a surviving tab retries after the syncing tab closes with its request in flight", async ({
  page,
  context,
}) => {
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const marker = `M1A_BROWSER_CLOSED_SYNC::${requiredEnv("M1A_TEST_RUN_ID")}`;
  let releaseRequest!: () => void;
  let resolveSyncingPage!: (page: Page) => void;
  const heldRequest = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const syncingPage = new Promise<Page>((resolve) => {
    resolveSyncingPage = resolve;
  });
  let heldFirstRequest = false;
  let firstRequestAt = 0;
  let postCount = 0;
  let forwardedCount = 0;

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("گذرواژه", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByLabel("متن یادداشت")).toBeVisible();

  const peer = await context.newPage();
  await peer.goto("/");
  await expect(peer.getByLabel("متن یادداشت")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("متن یادداشت").fill(marker);
  await page.getByRole("button", { name: "ذخیرهٔ یادداشت" }).click();
  await expect(page.getByText(marker)).toBeVisible();
  await expect(peer.getByText(marker)).toBeVisible();

  await context.route("**/api/v1/drafts", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON() as { text?: unknown } | null;
    if (body?.text !== marker) return route.continue();
    postCount += 1;
    if (!heldFirstRequest) {
      heldFirstRequest = true;
      firstRequestAt = Date.now();
      resolveSyncingPage(request.frame().page());
      await heldRequest;
      try {
        await route.abort("failed");
      } catch {
        return;
      }
      return;
    }
    forwardedCount += 1;
    await route.continue();
  });

  await context.setOffline(false);
  await Promise.all(
    [page, peer].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event("online")))),
  );
  const owner = await syncingPage;
  const survivor = owner === page ? peer : page;
  await survivor.evaluate(() => window.dispatchEvent(new Event("online")));

  const closed = owner.waitForEvent("close");
  const closing = owner.close();
  await closed;
  releaseRequest();
  await closing;

  await expect(survivor.getByText("همگام شد", { exact: true })).toBeVisible({ timeout: 45_000 });
  expect(Date.now() - firstRequestAt).toBeGreaterThanOrEqual(25_000);
  expect(postCount).toBe(2);
  expect(forwardedCount).toBe(1);
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for browser verification.`);
  return value;
}

test("holds conflicts and validation failures while retrying transient failures", async ({
  page,
}) => {
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const userId = requiredEnv("M1A_TEST_USER_ID");
  const attempts = new Map<string, number>();
  const retryPayloads: unknown[] = [];
  const cases = [
    { name: "conflict", status: 409, label: "نیازمند بررسی" },
    { name: "validation", status: 422, label: "نیازمند اصلاح" },
    { name: "retry", status: 503, label: "تلاش دوباره پس از اتصال" },
  ];

  await page.route("**/api/v1/drafts", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON() as { text?: unknown } | null;
    const selected = cases.find(
      (testCase) => body?.text === `M1A_BROWSER_${testCase.name}::${runId}`,
    );
    if (!selected) return route.continue();
    const attempt = (attempts.get(selected.name) ?? 0) + 1;
    attempts.set(selected.name, attempt);
    const payload = request.postDataJSON() as {
      commandId: string;
      entityId: string;
      text: string;
    };
    if (selected.name === "retry") {
      retryPayloads.push(payload);
      if (attempt > 1) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            protocolVersion: 1,
            commandId: payload.commandId,
            draft: {
              id: payload.entityId,
              authorUserId: userId,
              text: payload.text,
              version: 1,
              status: "DRAFT",
              createdAt: new Date().toISOString(),
            },
            replayed: false,
          }),
        });
        return;
      }
    }
    await route.fulfill({
      status: selected.status,
      contentType: "application/json",
      body: JSON.stringify({ code: selected.name.toUpperCase(), message: "verification response" }),
    });
  });

  await page.goto("/");
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("گذرواژه", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByLabel("متن یادداشت")).toBeVisible();

  for (const testCase of cases) {
    const marker = `M1A_BROWSER_${testCase.name}::${runId}`;
    await page.getByLabel("متن یادداشت").fill(marker);
    await page.getByRole("button", { name: "ذخیرهٔ یادداشت" }).click();
    await expect(page.getByText(testCase.label, { exact: true })).toBeVisible();
    expect(attempts.get(testCase.name)).toBe(1);

    await expectNoDraftPost(page, async () => {
      await page.getByRole("button", { name: "تلاش دوباره برای همگام‌سازی" }).click();
    });
    expect(attempts.get(testCase.name)).toBe(1);
    if (testCase.name === "retry") {
      await expect(page.getByText("همگام شد", { exact: true })).toBeVisible({ timeout: 12_000 });
      expect(attempts.get("retry")).toBe(2);
      expect(retryPayloads[1]).toEqual(retryPayloads[0]);
    }
  }

  await page.reload();
  for (const testCase of cases) {
    await expect(page.getByText(`M1A_BROWSER_${testCase.name}::${runId}`)).toBeVisible();
    if (testCase.name === "retry") {
      await expect(page.getByText("همگام شد", { exact: true })).toBeVisible();
      expect(attempts.get(testCase.name)).toBe(2);
    } else {
      await expect(page.getByText(testCase.label, { exact: true })).toBeVisible();
      expect(attempts.get(testCase.name)).toBe(1);
    }
  }
});

async function expectNoDraftPost(page: Page, action: () => Promise<void>): Promise<void> {
  const request = page
    .waitForRequest(
      (candidate) => candidate.url().endsWith("/api/v1/drafts") && candidate.method() === "POST",
      { timeout: 750 },
    )
    .then(
      () => true,
      () => false,
    );
  await action();
  expect(await request).toBe(false);
}
