import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
async function stagedExpense(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.locator("#username").fill(process.env.M1A_TEST_USERNAME!);
  await page.locator("#password").fill(process.env.M1A_TEST_PASSWORD!);
  const feed = page.waitForResponse((r) => r.url().includes("/api/v1/sync/changes?") && r.ok(), {
    timeout: 45000,
  });
  const bootstrap = page.waitForResponse(
    (r) => r.url().includes("/api/v1/sync/bootstrap?") && r.ok(),
  );
  await page.locator('button[type="submit"]').first().click();
  await bootstrap;
  await feed;
  await page.goto("/projects/" + process.env.M3_TEST_PROJECT_ID);
  const description = "remote evidence " + randomUUID();
  await page.locator("#finance-amount").fill("100");
  await page.locator("#finance-category").fill("transport");
  await page.locator("#finance-description").fill(description);
  await page
    .locator('input[name="date"]')
    .evaluate((el: HTMLInputElement) => (el.value = "2026-10-01"));
  const saved = page.waitForResponse((r) => r.url().endsWith("/finance/draft") && r.ok());
  await page.getByRole("button", { name: "ذخیره پیش‌نویس", exact: true }).click();
  const response = await saved;
  const record = await response.json();
  const headers = {
    origin: new URL(page.url()).origin,
    authorization: response.request().headers()["authorization"],
    "x-csrf-token": response.request().headers()["x-csrf-token"],
  };
  const id = randomUUID();
  const ticket = await page.request.post("/api/v1/attachments/upload-ticket", {
    headers,
    data: {
      id,
      recordId: record.id,
      parentType: "FINANCE",
      filename: "remote-only.pdf",
      mediaType: "application/pdf",
      size: 42,
    },
  });
  expect(ticket.ok(), await ticket.text()).toBe(true);
  const evidenceUrl = "/api/v1/attachments/record/" + record.id;
  await page.reload();
  const article = page.locator("article").filter({ hasText: description });
  await expect(article.getByText("remote-only.pdf — در انتظار بارگذاری")).toBeVisible();
  await expect(article.getByText("remote-only.pdf: در صف بارگذاری")).toHaveCount(0);
  return { article, record, headers, evidenceUrl, id };
}
test("remote-only pending evidence requires informed acknowledgment and immutable finalization retry", async ({
  page,
}) => {
  const { article, record, headers, evidenceUrl, id } = await stagedExpense(page);
  const rejected = await page.request.post("/api/v1/finance/finalize", {
    headers,
    data: {
      commandId: randomUUID(),
      recordId: record.id,
      expectedVersion: record.version,
      acknowledgePendingEvidence: false,
    },
  });
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ code: "PENDING_EVIDENCE" });
  const bodies: unknown[] = [];
  let committed = false;
  await page.route("**/api/v1/finance/finalize", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (!route.request().postDataJSON().acknowledgePendingEvidence) {
      await route.continue();
      return;
    }
    if (!committed) {
      const result = await route.fetch();
      expect(result.ok()).toBe(true);
      committed = true;
      await route.abort();
    } else await route.continue();
  });
  const decline = page.waitForEvent("dialog", { timeout: 5000 });
  const declining = article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  const warning = await decline;
  expect(warning.message()).toContain("پیوست");
  await warning.dismiss();
  await declining;
  await expect(page.getByText("Finalization cancelled; evidence retained")).toBeVisible();
  expect(bodies).toHaveLength(0);
  await expect(article.getByText("remote-only.pdf — در انتظار بارگذاری")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(article.getByText("قطعی", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(() => bodies.length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  expect(bodies[0]).toMatchObject({ acknowledgePendingEvidence: true, recordId: record.id });
  expect(bodies[1]).toEqual(bodies[0]);
  const retained = await page.request.get(evidenceUrl, { headers });
  expect(await retained.json()).toEqual([expect.objectContaining({ id, state: "STAGED" })]);
  await expect(article.getByText("remote-only.pdf — در انتظار بارگذاری")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("output/playwright/m4", { recursive: true });
  await article.screenshot({ path: "output/playwright/m4/remote-pending-evidence-360.png" });
});
test("attachment lookup failure blocks finalization and can be retried without dropping evidence", async ({
  page,
}) => {
  const { article } = await stagedExpense(page);
  let commands = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/finance/finalize")) commands++;
  });
  await page.route("**/api/v1/attachments/record/*", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(page.getByText("Evidence unavailable", { exact: true })).toBeVisible();
  expect(commands).toBe(0);
  await expect(article.getByRole("button", { name: "قطعی کردن", exact: true })).toBeEnabled();
  await page.unroute("**/api/v1/attachments/record/*");
  page.once("dialog", (dialog) => dialog.accept());
  await article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(article.getByText("قطعی", { exact: true })).toBeVisible();
  expect(commands).toBe(1);
  await expect(article.getByText("remote-only.pdf — در انتظار بارگذاری")).toBeVisible();
});

test("remote failed evidence is labeled separately and retained after acknowledged posting", async ({
  page,
}) => {
  const { article, id, headers, evidenceUrl } = await stagedExpense(page);
  const apiRequire = createRequire(resolve(process.cwd(), "apps/api/package.json"));
  const sql = apiRequire("postgres")(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe("update attachments set state='FAILED' where id=$1", [id]);
  } finally {
    await sql.end();
  }
  await page.reload();
  await expect(article.getByText("remote-only.pdf — بارگذاری ناموفق")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(article.getByText("قطعی", { exact: true })).toBeVisible();
  const retained = await page.request.get(evidenceUrl, { headers });
  expect(await retained.json()).toEqual([expect.objectContaining({ id, state: "FAILED" })]);
});
test("revoked attachment lookup pauses authentication without queuing or retrying finance", async ({
  page,
}) => {
  const { article } = await stagedExpense(page);
  let commands = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/finance/finalize")) commands++;
  });
  await page.route("**/api/v1/attachments/record/*", (route) =>
    route.fulfill({ status: 401, json: { code: "SESSION_REVOKED" } }),
  );
  await article.getByRole("button", { name: "قطعی کردن", exact: true }).click();
  await expect(page.getByText(/نشست این حساب لغو شده است/)).toBeVisible();
  await page.waitForTimeout(6500);
  expect(commands).toBe(0);
});
