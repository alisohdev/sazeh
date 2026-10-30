import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("FIN02 mobile expense draft survives offline and posts separate partial payment", async ({
  page,
  context,
}) => {
  page.on("pageerror", (error) => console.log("M4 page error:", error.stack));
  expect(
    (
      await page.request.get("/api/v1/attachments/00000000-0000-4000-8000-000000000001/download")
    ).status(),
  ).toBe(401);
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
  await context.setOffline(true);
  await page.locator("#finance-amount").fill("10000");
  await page.locator("#finance-category").fill("transport");
  await page.locator("#finance-description").fill("FIN02 mobile expense");
  await page
    .locator('input[name="date"]')
    .evaluate((el: HTMLInputElement) => (el.value = "2026-10-01"));
  await page.getByRole("button", { name: "ذخیره پیش‌نویس", exact: true }).click();
  await expect(page.getByText("پیش‌نویس روی دستگاه: 1")).toBeVisible();
  await page
    .locator('article input[type="file"]')
    .first()
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a00000000", "hex"),
    });
  await expect(page.getByText("synthetic.png: در صف بارگذاری")).toBeVisible();
  await page.reload();
  await expect(page.getByText("پیش‌نویس روی دستگاه: 1")).toBeVisible();
  let completionLost = false;
  await page.route("**/api/v1/attachments/*/complete", async (route) => {
    if (!completionLost) {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      completionLost = true;
      await route.abort();
    } else await route.continue();
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("FIN02 mobile expense", { exact: false })).toBeVisible({
    timeout: 45000,
  });
  await expect(page.getByText("synthetic.png — آماده")).toBeVisible({ timeout: 45000 });
  const article = page.locator("article").filter({ hasText: "FIN02 mobile expense" });
  await article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(article.getByText("قطعی", { exact: true })).toBeVisible();
  await page.locator("#finance-kind").selectOption("EXPENSE_PAYMENT");
  await page.locator("#finance-amount").fill("4000");
  await page.locator("#finance-category").fill("transport");
  await page.locator("#finance-description").fill("FIN02 mobile partial payment");
  await page.locator("#finance-source").selectOption({ label: "FIN02 mobile expense" });
  await page
    .locator('input[name="date"]')
    .evaluate((el: HTMLInputElement) => (el.value = "2026-10-02"));
  await page.getByRole("button", { name: "ذخیره پیش‌نویس", exact: true }).click();
  const payment = page.locator("article").filter({ hasText: "FIN02 mobile partial payment" });
  await payment.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(payment.getByText("قطعی", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await mkdir("output/playwright/m4", { recursive: true });
  await page.screenshot({ path: "output/playwright/m4/fin02-360.png", fullPage: true });
  await page
    .locator("details")
    .evaluateAll((nodes) => nodes.forEach((node) => node.setAttribute("open", "")));
  await page.pdf({ path: "output/m4/statement-print.pdf", format: "A4", printBackground: true });
});
