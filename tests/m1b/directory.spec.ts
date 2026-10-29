import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = resolve(process.cwd(), "output/playwright/m1b");

test("offline directory sync orders parents first and presents a 360 px Persian overview", async ({
  page,
  context,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const ownerName = `کارفرما ${runId.slice(0, 6)}`;
  const workerName = `نیرو ${runId.slice(0, 6)}`;
  const projectName = `پروژه آفلاین ${runId.slice(0, 6)}`;
  const updatedProjectName = `پروژه ویرایش‌شده ${runId.slice(0, 6)}`;
  const commandKinds: Array<{ kind: string; name: string }> = [];

  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, username, password);
  await expect(page.getByRole("heading", { name: "پروژه‌ها و فهرست‌ها" })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  await context.setOffline(true);

  await page.getByRole("tab", { name: "نیرو و تأمین‌کننده" }).click();
  await page.getByLabel("نام", { exact: true }).fill(ownerName);
  await page.getByLabel("کارفرما", { exact: true }).check();
  await page.getByRole("button", { name: "ذخیرهٔ مخاطب", exact: true }).click();
  await expect(page.getByRole("heading", { name: ownerName })).toBeVisible();

  await page.getByLabel("نام", { exact: true }).fill(workerName);
  await page.getByLabel("نیروی کار", { exact: true }).check();
  await page.getByRole("button", { name: "ذخیرهٔ مخاطب", exact: true }).click();
  await expect(page.getByRole("heading", { name: workerName })).toBeVisible();

  await page.getByRole("tab", { name: "پروژه‌ها" }).click();
  await page.getByLabel("نام پروژه").fill(projectName);
  await page.locator('select[name="ownerContactId"]').selectOption({ label: ownerName });
  await page.locator('input[name="startsOn"]').fill("۱۴۰۵/۰۷/۰۶");
  await page.locator('input[name="endsOn"]').fill("۱۴۰۵/۰۷/۱۰");
  await page.getByLabel("مبلغ اولیهٔ قرارداد (تومان)").fill("۱۲۰۰۰۰۰۰۰");
  await page.getByLabel("عنوان ردیف بودجه (اختیاری)").fill("نیروی کار");
  await page.getByLabel("مبلغ ردیف بودجه (تومان)").fill("۲۵۰۰۰۰۰");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByRole("tab", { name: "همکاری‌ها" }).click();
  await page.locator('select[name="workerId"]').selectOption({ label: workerName });
  await page.locator('select[name="projectId"]').selectOption({ label: projectName });
  await page.locator('select[name="type"]').selectOption("DAILY");
  await page.getByLabel("نرخ پیش‌فرض (تومان)").fill("۳۵۰۰۰۰");
  await page.locator('input[name="startsOn"]').fill("۱۴۰۵/۰۷/۰۶");
  await page.getByRole("button", { name: "ذخیرهٔ همکاری", exact: true }).click();
  await expect(page.getByText(`${workerName} · ${projectName}`)).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, "m1b-mobile-offline-queue.png"),
    fullPage: true,
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.reload();
  await page
    .getByRole("tablist", { name: "بخش‌های اطلاعات شرکت" })
    .getByRole("tab", { name: "همکاری‌ها" })
    .click();
  await expect(page.getByText(`${workerName} · ${projectName}`)).toBeVisible();
  await page.getByRole("tab", { name: "پروژه‌ها" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  context.on("request", (request) => {
    if (request.url().endsWith("/api/v1/sync/commands") && request.method() === "POST") {
      const commands = request.postDataJSON() as Array<{
        kind?: string;
        payload?: { displayName?: string; name?: string };
      }>;
      for (const command of commands)
        commandKinds.push({
          kind: command.kind ?? "",
          name: command.payload?.displayName ?? command.payload?.name ?? "",
        });
    }
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("فرمان‌های در صف: 0", { exact: true })).toBeVisible({
    timeout: 45_000,
  });

  const ownerIndex = commandKinds.findIndex(
    (command) => command.kind === "CONTACT_CREATE" && command.name === ownerName,
  );
  const workerIndex = commandKinds.findIndex(
    (command) => command.kind === "CONTACT_CREATE" && command.name === workerName,
  );
  const projectIndex = commandKinds.findIndex(
    (command) => command.kind === "PROJECT_CREATE" && command.name === projectName,
  );
  const engagementIndex = commandKinds.findIndex((command) => command.kind === "ENGAGEMENT_CREATE");
  const budgetIndex = commandKinds.findIndex((command) => command.kind === "BUDGET_SET");
  expect(ownerIndex).toBeGreaterThanOrEqual(0);
  expect(workerIndex).toBeGreaterThan(ownerIndex);
  expect(projectIndex).toBeGreaterThan(workerIndex);
  expect(engagementIndex).toBeGreaterThan(projectIndex);
  expect(budgetIndex).toBeGreaterThan(projectIndex);

  await page.screenshot({
    path: resolve(screenshotDirectory, "m1b-mobile-project-overview.png"),
    fullPage: true,
  });
  const projectCard = page.locator('[data-testid="project-card"]').filter({ hasText: projectName });
  await projectCard.getByRole("button", { name: "ویرایش", exact: true }).click();
  await page.getByLabel("نام پروژه").fill(updatedProjectName);
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
  await expect(page.getByRole("heading", { name: updatedProjectName })).toBeVisible();
  await expect(page.getByText("فرمان‌های در صف: 0", { exact: true })).toBeVisible({
    timeout: 45_000,
  });

  page.on("dialog", (dialog) => void dialog.accept("بررسی تاریخچهٔ همکاری"));
  const updatedCard = page
    .locator('[data-testid="project-card"]')
    .filter({ hasText: updatedProjectName });
  await updatedCard.getByRole("button", { name: "بایگانی", exact: true }).click();
  await page.getByLabel("نمایش بایگانی‌شده‌ها").check();
  const archivedCard = page
    .locator('[data-testid="project-card"]')
    .filter({ hasText: updatedProjectName });
  await expect(archivedCard.getByText("نیروی متمایز با احتساب سابقه")).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, "m1b-mobile-archived-project-history.png"),
    fullPage: true,
  });
  await archivedCard.getByRole("button", { name: "بازگشایی", exact: true }).click();
  await page.getByLabel("نمایش بایگانی‌شده‌ها").uncheck();
  await expect(page.getByRole("heading", { name: updatedProjectName })).toBeVisible();
});

test("directory conflicts show local and server values and support both resolutions", async ({
  page,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const localName = `پروژهٔ تعارض ${runId.slice(0, 6)}`;
  const revisedName = `پروژهٔ اصلاح‌شده ${runId.slice(0, 6)}`;
  let updated = false;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/api/v1/sync/commands", async (route) => {
    const commands = route.request().postDataJSON() as Array<{
      commandId: string;
      entityId: string;
      kind: string;
      payload: Record<string, unknown>;
    }>;
    const command = commands[0]!;
    if (command.kind === "PROJECT_CREATE") {
      const current = projectSnapshot(
        command.entityId,
        `${String(command.payload.name)} (نسخهٔ سرور)`,
        1,
      );
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              ok: false,
              commandId: command.commandId,
              status: 409,
              error: { code: "STALE_VERSION", message: "Changed", current },
            },
          ],
        }),
      });
      return;
    }
    if (command.kind === "PROJECT_UPDATE") {
      updated = true;
      const entity = projectSnapshot(command.entityId, String(command.payload.name), 2);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              ok: true,
              result: {
                protocolVersion: 1,
                commandId: command.commandId,
                entity,
                revision: "991",
                replayed: false,
              },
            },
          ],
        }),
      });
      return;
    }
    await route.continue();
  });

  await signIn(page, username, password);
  await page.getByLabel("نام پروژه").fill(localName);
  await page.getByLabel("مبلغ اولیهٔ قرارداد (تومان)").fill("۵۰۰۰۰۰۰");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  const conflictedCard = page
    .locator('[data-testid="project-card"]')
    .filter({ hasText: localName });
  await expect(conflictedCard.getByText("نیازمند بررسی", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(conflictedCard.getByText(/پیش‌نویس محلی:/)).toBeVisible();
  await expect(conflictedCard.getByText(/نسخهٔ سرور:/)).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, "m1b-mobile-conflict-review.png"),
    fullPage: true,
  });

  await conflictedCard
    .getByRole("button", { name: "ویرایش پیش‌نویس و ارسال دوباره", exact: true })
    .click();
  await page.getByLabel("نام پروژه").fill(revisedName);
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
  await expect(page.getByRole("heading", { name: revisedName })).toBeVisible();
  await expect(page.getByText("فرمان‌های در صف: 0", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(updated).toBe(true);
  await expect(page.getByRole("heading", { name: "پروژهٔ تازه" })).toBeVisible();

  const keepLocalName = `پروژهٔ پذیرش سرور ${runId.slice(0, 6)}`;
  await page.getByLabel("نام پروژه").fill(keepLocalName);
  await page.getByLabel("مبلغ اولیهٔ قرارداد (تومان)").fill("۰");
  const invalidFields = await page.getByLabel("نام پروژه").evaluate((input: HTMLInputElement) =>
    Array.from(input.form?.elements ?? [])
      .filter((element) => element instanceof HTMLInputElement && !element.checkValidity())
      .map((element) => ({ name: element.name, message: element.validationMessage })),
  );
  expect(invalidFields).toEqual([]);
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  const secondConflict = page
    .locator('[data-testid="project-card"]')
    .filter({ hasText: keepLocalName });
  await expect(secondConflict.getByText("نیازمند بررسی", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await secondConflict.getByRole("button", { name: "پذیرش نسخهٔ سرور", exact: true }).click();
  await expect(page.getByRole("heading", { name: `${keepLocalName} (نسخهٔ سرور)` })).toBeVisible();
});

test("expired change feed rebuild preserves local drafts and queued commands", async ({
  page,
  context,
}) => {
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const projectName = `پروژهٔ بازیابی ${runId.slice(0, 6)}`;
  let expiredResponses = 0;
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, username, password);
  await expect(page.getByRole("heading", { name: "پروژه‌ها و فهرست‌ها" })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("نام پروژه").fill(projectName);
  await page.getByLabel("مبلغ اولیهٔ قرارداد (تومان)").fill("۴۰۰۰۰۰۰");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.route("**/api/v1/sync/commands", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/v1/sync/changes**", async (route) => {
    if (expiredResponses === 0) {
      expiredResponses += 1;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "CURSOR_EXPIRED", resetRequired: true }),
      });
      return;
    }
    await route.continue();
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => expiredResponses).toBe(1);
  await expect(page.getByText("فرمان‌های در صف: 1", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(page.getByText("فرمان‌های در صف: 1", { exact: true })).toBeVisible();
});

test("a delayed create acknowledgment preserves a newer local edit and its dependent command", async ({
  page,
  context,
}) => {
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const oldName = `پروژهٔ پاسخ‌دیر ${runId.slice(0, 6)}`;
  const newName = `پروژهٔ ویرایش تازه ${runId.slice(0, 6)}`;
  let releaseAcknowledgment!: () => void;
  let resolveHeld!: () => void;
  const heldAcknowledgment = new Promise<void>((resolve) => {
    releaseAcknowledgment = resolve;
  });
  const firstRequest = new Promise<void>((resolve) => {
    resolveHeld = resolve;
  });
  const commandBodies: Array<Array<{ kind: string; expectedVersion: number; payload: unknown }>> =
    [];
  let createCount = 0;

  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, username, password);
  await context.setOffline(true);
  await page.getByLabel("نام پروژه").fill(oldName);
  await page.getByLabel("مبلغ اولیهٔ قرارداد (تومان)").fill("۱۰۰۰۰۰۰");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  await expect(page.getByRole("heading", { name: oldName })).toBeVisible();

  await page.route("**/api/v1/sync/commands", async (route) => {
    const commands = route.request().postDataJSON() as Array<{
      kind: string;
      expectedVersion: number;
      payload: unknown;
    }>;
    commandBodies.push(commands);
    if (commands[0]?.kind === "PROJECT_CREATE" && createCount++ === 0) {
      const response = await route.fetch();
      resolveHeld();
      await heldAcknowledgment;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await firstRequest;
  await page
    .locator('[data-testid="project-card"]')
    .filter({ hasText: oldName })
    .getByRole("button", { name: "ویرایش", exact: true })
    .click();
  await page.getByLabel("نام پروژه").fill(newName);
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات", exact: true }).click();
  await expect(page.getByRole("heading", { name: newName })).toBeVisible();
  releaseAcknowledgment();

  await expect(page.getByText("فرمان‌های در صف: 0", { exact: true })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("heading", { name: newName })).toBeVisible();
  expect(commandBodies[0]?.[0]?.kind).toBe("PROJECT_CREATE");
  expect(commandBodies[1]?.[0]?.kind).toBe("PROJECT_UPDATE");
  expect(commandBodies[1]?.[0]?.expectedVersion).toBe(1);
  expect(commandBodies[0]?.[0]?.payload).toMatchObject({ name: oldName });
  expect(commandBodies[1]?.[0]?.payload).toMatchObject({ name: newName });
});

test("a surviving tab retries a directory upload after its sending tab closes", async ({
  page,
  context,
}) => {
  const runId = requiredEnv("M1A_TEST_RUN_ID");
  const username = requiredEnv("M1A_TEST_USERNAME");
  const password = requiredEnv("M1A_TEST_PASSWORD");
  const projectName = `פרויקט התאוששות משלוח ${runId.slice(0, 6)}`;
  let releaseFirstResponse!: () => void;
  let resolveFirstRequest!: () => void;
  const firstResponseHeld = new Promise<void>((resolve) => {
    releaseFirstResponse = resolve;
  });
  const firstRequestSeen = new Promise<void>((resolve) => {
    resolveFirstRequest = resolve;
  });
  const commandAttempts: Array<Array<Record<string, unknown>>> = [];

  await page.setViewportSize({ width: 360, height: 800 });
  await context.route("**/api/v1/sync/commands", async (route) => {
    const commands = route.request().postDataJSON() as Array<Record<string, unknown>>;
    if (commands[0]?.kind !== "PROJECT_CREATE") {
      await route.continue();
      return;
    }
    commandAttempts.push(commands);
    if (commandAttempts.length === 1) {
      const response = await route.fetch();
      resolveFirstRequest();
      await firstResponseHeld;
      try {
        await route.fulfill({ response });
      } catch {
        // Closing the sending page intentionally abandons this acknowledgment.
      }
      return;
    }
    await route.continue();
  });

  await signIn(page, username, password);
  await context.setOffline(true);
  await page.getByLabel("نام پروژه").fill(projectName);
  await page.getByLabel("مبلغ اولیهٔ قرارداد (تومان)").fill("5000000");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await firstRequestSeen;
  expect(commandAttempts).toHaveLength(1);

  const survivingPage = await context.newPage();
  await survivingPage.setViewportSize({ width: 360, height: 800 });
  await survivingPage.goto("/");
  await expect(survivingPage.getByRole("heading", { name: projectName })).toBeVisible();
  expect(commandAttempts).toHaveLength(1);

  await page.close();
  releaseFirstResponse();
  await expect.poll(() => commandAttempts.length, { timeout: 65_000 }).toBe(2);
  expect(commandAttempts[1]).toEqual(commandAttempts[0]);
  await expect(survivingPage.getByText("فرمان‌های در صف: 0", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await survivingPage.close();
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

function projectSnapshot(id: string, name: string, version: number) {
  return {
    id,
    name,
    ownerContactId: null,
    startsOn: null,
    endsOn: null,
    lifecycle: "ACTIVE",
    archiveReason: null,
    contractInitialToman: "0",
    version,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for M1b browser verification.`);
  return value;
}
