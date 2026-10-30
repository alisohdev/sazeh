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
  const workforce = page.locator("#workforce-heading").locator("xpath=ancestor::section[1]");
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
    balances: { openingBalanceToman: "0", closingBalanceToman: "3000000" },
  });
  await expect(page.getByText("مانده ابتدای دوره")).toBeVisible();
  await expect(page.getByText("مانده پایان دوره")).toBeVisible();
  await page.locator("#workforce-statement").screenshot({
    path: resolve(screenshotDirectory, "m2-mobile-worker-statement.png"),
    animations: "disabled",
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  const lab01WorkerId = requiredEnv("M2_REVIEW_LAB01_WORKER_ID");
  const lab01ProjectId = requiredEnv("M2_REVIEW_LAB01_PROJECT_ID");
  const periodWorkerId = requiredEnv("M2_REVIEW_PERIOD_WORKER_ID");
  const periodProjectId = requiredEnv("M2_REVIEW_PERIOD_PROJECT_ID");
  const reviewStatement = page.locator("#workforce-statement");
  const lab01Report = waitForStatementReport(page, {
    workerId: lab01WorkerId,
    projectId: lab01ProjectId,
  });
  await reviewStatement.locator("select").nth(0).selectOption(lab01WorkerId);
  await reviewStatement.locator("select").nth(1).selectOption(lab01ProjectId);
  expect(await (await lab01Report).json()).toMatchObject({
    totals: {
      grossEarningsToman: "3000000",
      deductionsToman: "200000",
      netEarningsToman: "2800000",
      paymentsToman: "1500000",
      remainingBalanceToman: "1300000",
    },
    balances: { openingBalanceToman: "0", closingBalanceToman: "1300000" },
  });
  const lab01Closing = await page.evaluate(() => new Intl.NumberFormat("fa-IR").format(1_300_000));
  await expect(reviewStatement).toContainText(lab01Closing);
  await expect(reviewStatement.getByRole("status")).toHaveCount(0);
  await reviewStatement.screenshot({
    path: resolve(screenshotDirectory, "m2-mobile-worker-statement.png"),
    animations: "disabled",
  });

  const periodReport = waitForStatementReport(page, {
    workerId: periodWorkerId,
    projectId: periodProjectId,
    from: "2026-10-28",
    to: "2026-10-28",
  });
  await reviewStatement.locator("select").nth(0).selectOption(periodWorkerId);
  await reviewStatement.locator("select").nth(1).selectOption(periodProjectId);
  await reviewStatement.locator('input[type="date"]').nth(0).fill("2026-10-28");
  await reviewStatement.locator('input[type="date"]').nth(1).fill("2026-10-28");
  expect(await (await periodReport).json()).toMatchObject({
    totals: {
      grossEarningsToman: "0",
      deductionsToman: "0",
      netEarningsToman: "0",
      paymentsToman: "200000",
      remainingBalanceToman: "-200000",
    },
    balances: { openingBalanceToman: "1000000", closingBalanceToman: "800000" },
  });
  const periodClosing = await page.evaluate(() => new Intl.NumberFormat("fa-IR").format(800_000));
  await expect(reviewStatement).toContainText(periodClosing);
  await expect(reviewStatement.getByRole("status")).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await reviewStatement.screenshot({
    path: resolve(screenshotDirectory, "m2-mobile-worker-statement-period-balance.png"),
    animations: "disabled",
  });
});

test("failed workforce upload preserves an edit made while the request is pending", async ({
  page,
  context,
}) => {
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const engagementId = requiredEnv("M2_TEST_ENGAGEMENT_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const initialDescription = `Upload race initial ${runId.slice(0, 6)}`;
  const latestDescription = `Upload race latest ${runId.slice(0, 6)}`;
  let releaseHeldRequest!: () => void;
  let resolveHeldRequest!: () => void;
  const heldRequest = new Promise<void>((resolve) => {
    resolveHeldRequest = resolve;
  });

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
  const workforce = page.locator("#workforce-heading").locator("xpath=ancestor::section[1]");
  await workforce.locator("form select").first().selectOption(engagementId);
  await context.setOffline(true);
  await workforce.locator('input[name="quantity"]').fill("3");
  await workforce.locator('input[name="description"]').fill(initialDescription);
  await workforce.locator('form button[type="submit"]').click();
  await expect(workforce.locator('input[name="description"]')).toHaveValue(initialDescription);
  await page.reload();
  await expect(page.getByText(initialDescription)).toBeVisible();

  await page.route("**/api/v1/workforce/sync/commands", async (route) => {
    resolveHeldRequest();
    await new Promise<void>((resolve) => {
      releaseHeldRequest = resolve;
    });
    await route.abort();
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await heldRequest;

  const localDraft = page.getByText(initialDescription).locator("..").locator("..");
  await localDraft.getByRole("button").click();
  await workforce.locator('input[name="description"]').fill(latestDescription);
  await workforce.locator('form button[type="submit"]').click();
  await expect(page.getByText(latestDescription)).toBeVisible();
  await context.setOffline(true);
  releaseHeldRequest();

  await expect
    .poll(async () => {
      const state = await readWorkforceDraftState(page, latestDescription);
      return Boolean(
        state?.draft.editRevision === 2 &&
        state.draft.syncState === "PENDING" &&
        state.commands.some((entry) => entry.attempts === 1 && entry.retryAt > Date.now()),
      );
    })
    .toBe(true);

  await page.reload();
  await expect(page.getByText(latestDescription)).toBeVisible();
  await expect(page.getByText(initialDescription)).toHaveCount(0);
  const persisted = await readWorkforceDraftState(page, latestDescription);
  expect(persisted?.draft).toMatchObject({
    description: latestDescription,
    editRevision: 2,
    syncState: "PENDING",
  });
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
  await page.getByRole("link", { name: "کارکرد و پرداخت", exact: true }).click();
  await expect(page.locator("#workforce-heading")).toBeVisible();
}

function waitForStatementReport(
  page: Page,
  filter: { workerId: string; projectId: string; from?: string; to?: string },
) {
  return page.waitForResponse(
    (response) => {
      if (!response.url().includes("/api/v1/workforce/records?") || response.status() !== 200)
        return false;
      const url = new URL(response.url());
      return (
        url.searchParams.get("workerId") === filter.workerId &&
        url.searchParams.get("projectId") === filter.projectId &&
        (url.searchParams.get("from") ?? undefined) === filter.from &&
        (url.searchParams.get("to") ?? undefined) === filter.to
      );
    },
    { timeout: 45_000 },
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for M2 browser verification.`);
  return value;
}

async function readWorkforceDraftState(page: Page, description: string) {
  return page.evaluate(async (wantedDescription) => {
    const databaseName = (await indexedDB.databases()).find((item) =>
      item.name?.startsWith("sazeh-m1a-workspace-"),
    )?.name;
    if (!databaseName) return undefined;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction(["workforceDrafts", "workforceOutbox"], "readonly");
      const read = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [drafts, entries] = await Promise.all([
        read(transaction.objectStore("workforceDrafts").getAll()),
        read(transaction.objectStore("workforceOutbox").getAll()),
      ]);
      const draft = (
        drafts as Array<{
          id: string;
          data: { description: string };
          editRevision: number;
          syncState: string;
        }>
      ).find((item) => item.data.description === wantedDescription);
      if (!draft) return undefined;
      return {
        draft: {
          description: draft.data.description,
          editRevision: draft.editRevision,
          syncState: draft.syncState,
        },
        commands: (
          entries as Array<{
            recordId: string;
            attempts: number;
            retryAt: number;
          }>
        )
          .filter((entry) => entry.recordId === draft.id)
          .map(({ attempts, retryAt }) => ({ attempts, retryAt })),
      };
    } finally {
      database.close();
    }
  }, description);
}
