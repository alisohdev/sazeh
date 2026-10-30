import { test, expect, type Page, type Request } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const apiRequire = createRequire(resolve(process.cwd(), "apps/api/package.json"));
async function login(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.locator("#username").fill(process.env.M1A_TEST_USERNAME!);
  await page.locator("#password").fill(process.env.M1A_TEST_PASSWORD!);
  const feed = page.waitForResponse(
    (response) => response.url().includes("/api/v1/sync/changes?") && response.ok(),
    { timeout: 45000 },
  );
  const bootstrap = page.waitForResponse(
    (response) => response.url().includes("/api/v1/sync/bootstrap?") && response.ok(),
  );
  await page.locator('button[type="submit"]').first().click();
  await bootstrap;
  await feed;
  await expect(page.locator("#username")).toHaveCount(0);
  await page.goto("/projects/" + process.env.M3_TEST_PROJECT_ID);
  await expect(page.locator("#finance-kind")).toBeVisible();
}
async function save(page: Page, description: string) {
  await page.locator("#finance-amount").fill("100");
  await page.locator("#finance-category").fill("transport");
  await page.locator("#finance-description").fill(description);
  await page
    .locator('input[name="date"]')
    .evaluate((el: HTMLInputElement) => (el.value = "2026-10-01"));
  await page.getByRole("button", { name: "ذخیره پیش‌نویس", exact: true }).click();
}
test("expired session pauses multiple finance commands and their retry timer", async ({
  page,
  context,
}) => {
  await login(page);
  await context.setOffline(true);
  await save(page, "pause finance one");
  await save(page, "pause finance two");
  await expect(page.getByText("پیش‌نویس روی دستگاه: 2")).toBeVisible();
  const sql = apiRequire("postgres")(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe("update sessions set expires_at=$1 where user_id=$2", [
      new Date(Date.now() - 60000),
      process.env.M1A_TEST_USER_ID,
    ]);
  } finally {
    await sql.end();
  }
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("status").filter({ hasText: /برای.*همگام.سازی دوباره وارد شوید/ }),
  ).toBeVisible();
  let requests = 0;
  const listener = (req: Request) => {
    if (req.method() === "POST" && /finance|auth\/refresh/.test(req.url())) requests++;
  };
  context.on("request", listener);
  await page.waitForTimeout(6500);
  context.off("request", listener);
  expect(requests, "paused finance must not retry or refresh authentication").toBe(0);
  await expect(page.getByText("پیش‌نویس روی دستگاه: 2")).toBeVisible();
});
test("unsynchronized finance drafts can be edited on device", async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await save(page, "editable local finance");
  const local = page.locator("article").filter({ hasText: "editable local finance" });
  await local.getByText("ویرایش پیش‌نویس", { exact: true }).click();
  await local.locator('input[name="description"]').fill("revised local finance");
  await local.getByRole("button", { name: "ذخیره ویرایش روی دستگاه" }).click();
  await expect(page.locator("article").filter({ hasText: "revised local finance" })).toBeVisible();
  await page.reload();
  await expect(page.locator("article").filter({ hasText: "revised local finance" })).toBeVisible();
});

test("lost finance acknowledgment replays immutable command and preserves a newer edit", async ({
  page,
  context,
}) => {
  await login(page);
  await context.setOffline(true);
  await save(page, "original delayed finance");
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const bodies: Array<{
    commandId: string;
    expectedVersion: number;
    input: { description: string };
  }> = [];
  let committed = false;
  await page.route("**/api/v1/finance/draft", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (!committed) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committed = true;
      await gate;
      await route.abort();
    } else await route.continue();
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => committed).toBe(true);
  const local = page.locator("article").filter({ hasText: "original delayed finance" });
  await local.getByText("ویرایش پیش‌نویس", { exact: true }).click();
  await local.locator('input[name="description"]').fill("newer delayed finance");
  await local.getByRole("button", { name: "ذخیره ویرایش روی دستگاه" }).click();
  await expect(page.locator("article").filter({ hasText: "newer delayed finance" })).toBeVisible();
  release();
  await expect.poll(() => bodies.length, { timeout: 45000 }).toBeGreaterThanOrEqual(3);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]!.commandId).not.toBe(bodies[0]!.commandId);
  expect(bodies[2]!.expectedVersion).toBe(1);
  expect(bodies[2]!.input.description).toBe("newer delayed finance");
  await expect(page.getByText("پیش‌نویس روی دستگاه: 0")).toBeVisible();
});
test("stale finance drafts support explicit revise and accept-server decisions", async ({
  page,
}) => {
  await login(page);
  await save(page, "conflict seed");
  await expect(page.getByText("پیش‌نویس روی دستگاه: 0")).toBeVisible();
  const server = page.locator("article").filter({ hasText: "conflict seed" });
  // The local editor has the same label; wait for the persisted server record.
  await expect(server.getByRole("button", { name: "قطعی کردن", exact: true })).toBeVisible();
  await expect(server.getByText("ویرایش پیش‌نویس", { exact: true })).toBeVisible();
  let conflicts = 0;
  await page.route("**/api/v1/finance/draft", async (route) => {
    const body = route.request().postDataJSON();
    if (body.expectedVersion > 0 && conflicts < 2) {
      conflicts++;
      const sql = apiRequire("postgres")(process.env.DATABASE_URL, { max: 1 });
      try {
        await sql.unsafe(
          "update finance_records set version=version+1,description=$1 where id=$2",
          ["other admin " + conflicts, body.recordId],
        );
      } finally {
        await sql.end();
      }
    }
    await route.continue();
  });
  await server.getByText("ویرایش پیش‌نویس", { exact: true }).click();
  await server.locator('input[name="description"]').fill("local conflict revision");
  await server.getByRole("button", { name: "ذخیره ویرایش روی دستگاه" }).click();
  const conflict = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "ارسال نسخه اصلاح‌شده" }) });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByText(/other admin 1/)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: "output/playwright/m4/finance-conflict-360.png", fullPage: true });
  await conflict.getByText("ویرایش پیش‌نویس", { exact: true }).click();
  await conflict.locator('input[name="description"]').fill("revised after conflict");
  await conflict.getByRole("button", { name: "ذخیره ویرایش روی دستگاه" }).click();
  await page.getByRole("button", { name: "ارسال نسخه اصلاح‌شده" }).click();
  await expect(page.getByRole("button", { name: "پذیرش نسخه سرور" })).toBeVisible();
  await expect(conflict.getByText(/other admin 2/)).toBeVisible();
  await page.getByRole("button", { name: "پذیرش نسخه سرور" }).click();
  await expect(page.getByText("پیش‌نویس روی دستگاه: 0")).toBeVisible();
  await expect(page.getByRole("button", { name: "پذیرش نسخه سرور" })).toHaveCount(0);
  await page.unroute("**/api/v1/finance/draft");
  const external = page.locator("article").filter({ hasText: "other admin 2" });
  if ((await external.locator("details").getAttribute("open")) === null)
    await external.getByText("ویرایش پیش‌نویس", { exact: true }).click();
  await external.locator('input[name="description"]').fill("accepted explicit revision");
  await external.getByRole("button", { name: "ذخیره ویرایش روی دستگاه" }).click();
  await expect(page.getByText("پیش‌نویس روی دستگاه: 0")).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "accepted explicit revision" }),
  ).toBeVisible();
});

test("project evidence survives offline reload and stays in its account across sign-out", async ({
  page,
  context,
}) => {
  await login(page);
  await context.setOffline(true);
  await page
    .locator('aside input[type="file"]')
    .first()
    .setInputFiles({
      name: "private-contract.png",
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a00000000", "hex"),
    });
  await expect(page.getByText("private-contract.png: در صف بارگذاری")).toBeVisible();
  await page.reload();
  await expect(page.getByText("private-contract.png: در صف بارگذاری")).toBeVisible();
  await page.route("**/api/v1/attachments/upload-ticket", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"storage temporarily unavailable"}',
    }),
  );
  await context.setOffline(false);
  await page.getByRole("link", { name: "حساب کاربری", exact: true }).click();
  await page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "دریافت خروجی" }).click();
  await download;
  await page.getByRole("button", { name: "خروج پس از دریافت خروجی" }).click();
  await expect(page.locator("#username")).toBeVisible();
  const sql = apiRequire("postgres")(process.env.DATABASE_URL, { max: 1 });
  const [previous] = await sql.unsafe(
    "select id,password_hash,must_change_password from users where username=$1",
    [process.env.M1A_TEST_ALT_USERNAME],
  );
  const hash = await apiRequire("argon2").hash(process.env.M1A_TEST_ALT_PASSWORD!);
  try {
    await sql.unsafe("update users set password_hash=$1,must_change_password=false where id=$2", [
      hash,
      previous.id,
    ]);
    let uploads = 0;
    page.on("request", (request) => {
      if (request.url().includes("/attachments/upload-ticket")) uploads++;
    });
    await page.locator("#username").fill(process.env.M1A_TEST_ALT_USERNAME!);
    await page.locator("#password").fill(process.env.M1A_TEST_ALT_PASSWORD!);
    const alternateFeed = page.waitForResponse(
      (response) => response.url().includes("/api/v1/sync/changes?") && response.ok(),
      { timeout: 45000 },
    );
    const alternateBootstrap = page.waitForResponse(
      (response) => response.url().includes("/api/v1/sync/bootstrap?") && response.ok(),
    );
    await page.locator('button[type="submit"]').first().click();
    await alternateBootstrap;
    await alternateFeed;
    await expect(page.locator("#username")).toHaveCount(0);
    await page.goto("/projects/" + process.env.M3_TEST_PROJECT_ID);
    await expect(page.locator("#finance-kind")).toBeVisible();
    await expect(page.getByText(/private-contract/)).toHaveCount(0);

    await page.waitForTimeout(5500);
    expect(uploads).toBe(0);
  } finally {
    await sql.unsafe("update users set password_hash=$1,must_change_password=$2 where id=$3", [
      previous.password_hash,
      previous.must_change_password,
      previous.id,
    ]);
    await sql.end();
  }
});
