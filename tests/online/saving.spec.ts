import { test, expect } from "@playwright/test";
import { installApi } from "./api-fixture";

test("project creation waits for server confirmation", async ({ page }) => {
  const api = await installApi(page);
  let release!: () => void;
  api.holdProjects(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  await page.goto("/projects");
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "پروژهٔ تازه" }).click();
  await page.locator('input[name="name"]').fill("پروژه آنلاین");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  await expect.poll(() => api.requests.length).toBe(1);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(1);
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(2);
  expect(api.requests[0]?.path).toBe("projects");
  expect(api.errors).toEqual([]);
});

test("failed saves stay in the form and never replay on reconnect or reload", async ({
  page,
  context,
}) => {
  const api = await installApi(page);
  api.failProjects();
  await page.goto("/projects");
  await page.getByRole("button", { name: "پروژهٔ تازه" }).click();
  await page.locator('input[name="name"]').fill("نباید ذخیره شود");
  await page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("ثبت پروژه انجام نشد");
  await expect(page.locator('input[name="name"]')).toHaveValue("نباید ذخیره شود");
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: "ذخیرهٔ پروژه", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(1);
  expect(api.requests.filter((request) => request.path === "projects")).toHaveLength(1);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((items) => items.length),
    ),
  ).toBe(0);
  expect(api.errors).toEqual([]);
});

test("notes use immediate authenticated requests and retain failed input", async ({ page }) => {
  const api = await installApi(page);
  await page.goto(`/projects/${api.project.id}`);
  await page.locator("#project-note").fill("یادداشت ثبت شده روی سرور");
  await page.getByRole("button", { name: "ثبت یادداشت", exact: true }).click();
  await expect(page.locator("#project-note")).toHaveValue("");
  expect(api.notes).toHaveLength(1);
  api.failNotes();
  await page.locator("#project-note").fill("یادداشت ناموفق");
  await page.getByRole("button", { name: "ثبت یادداشت", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("ثبت یادداشت انجام نشد");
  await expect(page.locator("#project-note")).toHaveValue("یادداشت ناموفق");
  expect(api.notes).toHaveLength(1);
  expect(api.errors).toEqual([]);
});

test("login, online session restoration, and logout clear private views", async ({
  page,
  context,
}) => {
  const api = await installApi(page, false);
  await page.goto("/projects");
  await page.locator("#username").fill("testadmin");
  await page.locator("#password").fill("test-password");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(1);
  const otherTab = await context.newPage();
  await installApi(otherTab);
  await otherTab.goto("/projects");
  await expect(otherTab.locator('[data-testid="project-card"]')).toHaveCount(1);
  await page.locator('nav:visible a[href="/account"]').click();
  await page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
  await expect(page.locator("#username")).toBeVisible();
  await expect(otherTab.locator("#username")).toBeVisible();
  await otherTab.reload();
  await expect(otherTab.locator("#username")).toBeVisible();
  await page.reload();
  await expect(page.locator("#username")).toBeVisible();
  expect(api.errors).toEqual([]);
});

test("360px RTL layout remains usable without offline storage", async ({ page }) => {
  const api = await installApi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/projects");
  await expect(page.locator('[data-testid="project-card"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "پروژهٔ تازه" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(api.errors).toEqual([]);
});
