import { expect, type Page } from "@playwright/test";

export async function openFixtureProjectDossier(page: Page): Promise<void> {
  const projectName = requiredEnv("M2_TEST_PROJECT_NAME");
  await page.getByRole("link", { name: "پروژه‌ها", exact: true }).click();
  const projectCard = page.getByTestId("project-card").filter({ hasText: projectName });
  await expect(projectCard).toBeVisible();
  await projectCard.getByRole("button", { name: "باز کردن پرونده", exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  await expect(page.getByLabel("متن یادداشت")).toBeVisible();
}

export async function openAccountPage(page: Page): Promise<void> {
  await page.getByRole("link", { name: "حساب کاربری", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "حساب کاربری", exact: true }).first(),
  ).toBeVisible();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for project dossier verification.`);
  return value;
}
