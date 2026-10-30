import { test, expect } from "@playwright/test";
import { installApi } from "./api-fixture";

test("login and shared API failures show Persian messages instead of server English", async ({
  page,
}) => {
  await installApi(page, false);
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "INVALID_CREDENTIALS", message: "Username or password is incorrect" },
    }),
  );
  await page.goto("/projects");
  await page.locator("#username").fill("superadmin");
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(page.locator(".feedback")).toHaveText("نام کاربری یا گذرواژه نادرست است.");
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({ status: 429, json: { code: "LOGIN_THROTTLED", message: "Try again later" } }),
  );
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(page.locator(".feedback")).toHaveText(
    "تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
  );
  await installApi(page);
  await page.route("**/api/v1/projects*", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "UNKNOWN_SERVER_ERROR", message: "Internal server error" },
    }),
  );
  await page.goto("/projects");
  await expect(page.getByRole("alert")).toHaveText(
    "سرور در حال حاضر پاسخ‌گو نیست. کمی بعد دوباره تلاش کنید.",
  );
});
