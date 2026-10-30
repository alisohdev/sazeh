import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = resolve(process.cwd(), "output/playwright/m2");

test("offline workforce draft survives refresh, replays a lost reply, and requires online finalization", async ({
  page,
  context,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const workerName = requiredEnv("M2_TEST_WORKER_NAME");
  const projectName = requiredEnv("M2_TEST_PROJECT_NAME");
  const engagementId = requiredEnv("M2_TEST_ENGAGEMENT_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const suffix = runId.slice(0, 6);
  const originalDescription = `Offline workforce ${suffix}`;
  const revisedDescription = `Edited workforce ${suffix}`;
  const submittedCommands: unknown[] = [];
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
  await expect(page.locator("#workforce-heading")).toBeVisible();
  await directoryBootstrap;
  await directoryFeed;
  await page.reload();
  await expect(page.locator("#workforce-heading")).toBeVisible();
  const workforce = page.locator('section[aria-label="ثبت دستمزد و پرداخت"]');
  const engagement = workforce.locator("form select").first();
  const engagementOption = engagement.locator(`option[value="${engagementId}"]`);
  await expect(engagementOption).toContainText(workerName);
  await expect(engagementOption).toContainText(projectName);
  await engagement.selectOption(engagementId);

  await context.setOffline(true);
  await workforce.locator('input[name="quantity"]').fill("3");
  await workforce.locator('input[name="description"]').fill(originalDescription);
  await workforce.locator('form button[type="submit"]').click();
  await expect(workforce.locator('input[name="description"]')).toHaveValue(originalDescription);
  await page.reload();
  await expect(page.getByText(originalDescription)).toBeVisible();
  await expect(page.getByText(/PENDING/)).toBeVisible();

  const localDraft = page.getByText(originalDescription).locator("..").locator("..");
  await localDraft.getByRole("button").click();
  await workforce.locator('input[name="description"]').fill(revisedDescription);
  await workforce.locator('form button[type="submit"]').click();
  await page.reload();
  await expect(page.getByText(revisedDescription)).toBeVisible();
  await expect(page.getByText(originalDescription)).toHaveCount(0);
  await page.screenshot({
    path: resolve(screenshotDirectory, "m2-mobile-offline-workforce-draft.png"),
    fullPage: true,
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await workforce.locator("select").nth(2).selectOption({ label: workerName });
  await page.route("**/api/v1/workforce/sync/commands", async (route) => {
    const commands = route.request().postDataJSON() as Array<Record<string, unknown>>;
    submittedCommands.push(commands);
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
  await expect.poll(() => submittedCommands.length, { timeout: 45_000 }).toBeGreaterThanOrEqual(2);
  expect(submittedCommands[1]).toEqual(submittedCommands[0]);
  const firstCommand = (
    submittedCommands[0] as Array<{
      input: { description: string; quantity: string; rateToman: string };
    }>
  )[0]!;
  expect(firstCommand.input).toMatchObject({
    description: revisedDescription,
    quantity: "3",
    rateToman: "1000000",
  });

  const statement = page.locator('section[aria-label="ریز گردش حساب"]');
  const finalize = statement.getByRole("button").last();
  await expect(finalize).toBeEnabled({ timeout: 45_000 });
  const finalization = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/workforce/drafts/") &&
      response.url().endsWith("/finalize") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );
  await finalize.click();
  const finalized = await finalization;
  expect(await finalized.json()).toMatchObject({ status: "FINALIZED", amountToman: "3000000" });
  const statementResponse = await page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/workforce/records?") &&
      response.request().method() === "GET",
  );
  expect(await statementResponse.json()).toMatchObject({
    totals: {
      grossEarningsToman: "3000000",
      deductionsToman: "0",
      netEarningsToman: "3000000",
      paymentsToman: "0",
      remainingBalanceToman: "3000000",
    },
  });
  await page.screenshot({
    path: resolve(screenshotDirectory, "m2-mobile-worker-statement.png"),
    fullPage: true,
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

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
  await expect(page.getByRole("heading", { name: "پروژه‌ها و فهرست‌ها" })).toBeVisible();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for M2 browser verification.`);
  return value;
}
