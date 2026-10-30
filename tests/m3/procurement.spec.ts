import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = resolve(process.cwd(), "output/playwright/m3");

test("mobile procurement draft survives offline, replays immutably, and finalizes into stock analytics", async ({
  page,
  context,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const projectName = requiredEnv("M3_TEST_PROJECT_NAME");
  const projectId = requiredEnv("M3_TEST_PROJECT_ID");
  const supplierName = requiredEnv("M3_TEST_SUPPLIER_NAME");
  const materialName = requiredEnv("M3_TEST_MATERIAL_NAME");
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const description = `خرید آفلاین ${runId.slice(0, 6)}`;
  const submitted: unknown[] = [];
  let committedReplyLost = false;

  await page.setViewportSize({ width: 360, height: 800 });
  const directoryBootstrap = page.waitForResponse(
    (response) => response.url().includes("/api/v1/sync/bootstrap?") && response.status() === 200,
    { timeout: 45_000 },
  );
  const directoryFeed = page.waitForResponse(
    (response) => response.url().includes("/api/v1/sync/changes?") && response.status() === 200,
    { timeout: 45_000 },
  );
  await signIn(page, username, password);
  await directoryBootstrap;
  await directoryFeed;
  await page.goto("/procurement");
  await expect(page.locator("#procurement-heading")).toBeVisible();

  await context.setOffline(true);
  await selectOption(page, "#procurement-project", projectName);
  await selectOption(page, "#procurement-supplier", supplierName);
  await selectOption(page, '[id^="material-"]', materialName);
  await page.locator('[id^="quantity-"]').fill("10");
  await page.locator('[id^="price-"]').fill("250000");
  await selectOption(page, "#receive-all", "دریافت همه اکنون");
  await page.locator("#procurement-description").fill(description);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/روی دستگاه ذخیره شد/)).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "گزارش و تحلیل" }).click();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByText("PENDING")).toBeVisible();
  await page
    .locator('[data-evidence-type="PROCUREMENT"] input[type="file"]')
    .first()
    .setInputFiles({
      name: "invoice-evidence.png",
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a00000000", "hex"),
    });
  await page.reload();
  await page.getByRole("tab", { name: "گزارش و تحلیل" }).click();
  await expect(page.getByText("invoice-evidence.png: در صف بارگذاری")).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, "m3-mobile-offline-invoice-draft.png"),
    fullPage: true,
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.route("**/api/v1/procurement/sync/commands", async (route) => {
    const commands = route.request().postDataJSON();
    submitted.push(commands);
    if (!committedReplyLost) {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      committedReplyLost = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => submitted.length, { timeout: 45_000 }).toBeGreaterThanOrEqual(2);
  expect(submitted[1]).toEqual(submitted[0]);

  await expect(page.getByText("invoice-evidence.png — آماده").first()).toBeVisible({
    timeout: 45000,
  });
  const finalizeButton = page.getByRole("button", { name: "ثبت نهایی آنلاین" });
  await expect(finalizeButton).toBeEnabled({ timeout: 45_000 });
  const finalization = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/procurement/drafts/") &&
      response.url().endsWith("/finalize") &&
      response.request().method() === "POST" &&
      response.status() === 201,
    { timeout: 45_000 },
  );
  await finalizeButton.click();
  const finalizationBody = await (await finalization).json();
  expect(finalizationBody).toMatchObject({
    document: { status: "FINALIZED", totalToman: "2500000" },
    linkedReceipt: { status: "FINALIZED", invoiceId: finalizationBody.document.id },
  });

  const reportResponse = page.waitForResponse(
    (response) => {
      if (!response.url().includes("/api/v1/procurement/report?") || response.status() !== 200)
        return false;
      return new URL(response.url()).searchParams.get("projectId") === projectId;
    },
    { timeout: 45_000 },
  );
  await selectOption(page, "#report-project", projectName);
  const report = await (await reportResponse).json();
  expect(report).toMatchObject({
    totals: {
      procurementToman: "2500000",
      outstandingDebtToman: "2500000",
      stockValueToman: "2500000",
      consumptionCostToman: "0",
    },
  });
  expect(report.purchasesBySupplier).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: supplierName, amountToman: "2500000" }),
    ]),
  );
  await expect(page.getByText("خرید بر پایه تأمین‌کننده")).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();
  await page.locator("#procurement-report").screenshot({
    path: resolve(screenshotDirectory, "m3-mobile-finalized-analytics.png"),
    animations: "disabled",
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

async function selectOption(page: Page, trigger: string, label: string) {
  await page.locator(trigger).first().click();
  await page.getByRole("option", { name: new RegExp(escapeRegExp(label)) }).click();
}

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/");
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST",
  );
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("گذرواژه", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  expect((await loginResponse).status()).toBe(200);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for M3 browser verification.`);
  return value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
