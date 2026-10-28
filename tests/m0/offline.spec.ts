import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const apiRequire = createRequire(resolve(process.cwd(), "apps/api/package.json"));
const { DraftCreateCommandSchema } = apiRequire("@sazeh/contracts");

test("authenticated offline drafts survive session expiry, sync once across tabs, and stay private on account switch", async ({
  page,
  context,
}) => {
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const userId = requiredEnv("M1A_TEST_USER_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const alternateUsername = requiredEnv("M1A_TEST_ALT_USERNAME");
  const alternatePassword = requiredEnv("M1A_TEST_ALT_PASSWORD");

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.text();
  expect(manifest).toMatch(/"display"\s*:\s*"standalone"/);
  expect(manifest).toMatch(/"sizes"\s*:\s*"192x192"/);
  expect(manifest).toMatch(/"sizes"\s*:\s*"512x512"/);
  for (const iconPath of ["/pwa-192.png", "/pwa-512.png"]) {
    const iconResponse = await page.request.get(iconPath);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("گذرواژه", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByLabel("متن یادداشت")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole("button", { name: "مدیریت حساب‌های مدیران" }).click();
  await expect(page.getByText(alternateUsername, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "بستن مدیریت حساب‌ها" }).click();

  const peer = await context.newPage();
  await peer.goto("/");
  await expect(peer.getByLabel("متن یادداشت")).toBeVisible();

  const posts = new Map<string, number>();
  context.on("request", (request) => {
    if (!request.url().endsWith("/api/v1/drafts") || request.method() !== "POST") return;
    const parsed = DraftCreateCommandSchema.safeParse(request.postDataJSON());
    if (parsed.success) posts.set(parsed.data.text, (posts.get(parsed.data.text) ?? 0) + 1);
  });

  const syncedMarker = `M1A_BROWSER_SYNC::${runId}`;
  await context.setOffline(true);
  await saveOfflineDraft(page, syncedMarker);
  await page.reload();
  await expect(page.getByText(syncedMarker)).toBeVisible();
  await peer.reload();
  await expect(peer.getByText(syncedMarker)).toBeVisible();

  await context.setOffline(false);
  await Promise.all([
    page.evaluate(() => window.dispatchEvent(new Event("online"))),
    peer.evaluate(() => window.dispatchEvent(new Event("online"))),
  ]);
  await expect(page.getByText("همگام شد")).toBeVisible();
  expect(posts.get(syncedMarker)).toBe(1);
  await peer.reload();
  await expect(peer.getByText("همگام شد")).toBeVisible();

  const pendingMarker = `M1A_BROWSER_PRIVATE::${runId}`;
  await context.setOffline(true);
  await saveOfflineDraft(page, pendingMarker);
  await page.reload();
  await expect(page.getByText(pendingMarker)).toBeVisible();
  await peer.reload();
  await expect(peer.getByText(pendingMarker)).toBeVisible();
  await expireFixtureSessions(userId);

  await context.setOffline(false);
  await expect(
    page.getByText("اتصال برقرار شد؛ برای ادامهٔ همگام‌سازی دوباره وارد شوید."),
  ).toBeVisible();
  await page.getByRole("button", { name: "تلاش دوباره برای همگام‌سازی" }).click();
  await expect(page.getByText("ورود دوباره لازم است")).toBeVisible();
  expect(posts.get(pendingMarker) ?? 0).toBe(0);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروج / تغییر حساب" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "دریافت خروجی" }).click();
  expect((await download).suggestedFilename()).toBe("sazeh-pending-drafts.json");
  await page.getByRole("button", { name: "خروج پس از دریافت خروجی" }).click();
  await expect(page.getByLabel("نام کاربری")).toBeVisible();

  await page.getByLabel("نام کاربری").fill(alternateUsername);
  await page.getByLabel("گذرواژه", { exact: true }).fill(alternatePassword);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("heading", { name: "تغییر گذرواژهٔ موقت" })).toBeVisible();
  const newPassword = "M1a-browser-new-password-2026!";
  await page.getByLabel("گذرواژهٔ فعلی").fill(alternatePassword);
  await page.getByLabel("گذرواژهٔ تازه (حداقل ۱۴ نویسه)").fill(newPassword);
  await page.getByLabel("تکرار گذرواژهٔ تازه").fill(newPassword);
  await page.getByRole("button", { name: "ذخیره و ورود دوباره" }).click();
  await expect(page.getByLabel("نام کاربری")).toBeVisible();
  await page.getByLabel("نام کاربری").fill(alternateUsername);
  await page.getByLabel("گذرواژه", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByLabel("متن یادداشت")).toBeVisible();
  await expect(page.getByText(syncedMarker)).toHaveCount(0);
  await expect(page.getByText(pendingMarker)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "مدیریت حساب‌های مدیران" })).toHaveCount(0);
  expect(posts.get(pendingMarker) ?? 0).toBe(0);
});

async function saveOfflineDraft(page: Page, text: string): Promise<void> {
  await page.getByLabel("متن یادداشت").fill(text);
  await page.getByRole("button", { name: "ذخیرهٔ یادداشت" }).click();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByText("در صف ارسال")).toBeVisible();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for browser verification.`);
  return value;
}

async function expireFixtureSessions(userId: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^[0-9a-f-]{36}$/i.test(userId))
    throw new Error("Browser session fixture is invalid.");
  const postgres = apiRequire("postgres");
  if (typeof postgres !== "function")
    throw new Error("PostgreSQL verification client is unavailable.");
  const client: {
    unsafe(query: string, parameters: unknown[]): Promise<unknown[]>;
    end(options: { timeout: number }): Promise<void>;
  } = postgres(databaseUrl, { max: 1 });
  try {
    const expired = await client.unsafe(
      "UPDATE sessions SET expires_at = $1 WHERE user_id = $2 AND revoked_at IS NULL RETURNING id",
      [new Date(Date.now() - 60_000), userId],
    );
    expect(expired.length).toBeGreaterThan(0);
  } finally {
    await client.end({ timeout: 5 });
  }
}
