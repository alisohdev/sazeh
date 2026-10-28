import { expect, test } from "@playwright/test";

test("offline draft survives reload and synchronizes through the API once", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    display: string;
    icons: Array<{ sizes: string; type: string }>;
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
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

  await context.setOffline(true);
  const note = `M0_BROWSER_PROOF::${crypto.randomUUID()}`;
  await page.getByLabel("متن یادداشت").fill(note);
  await page.getByRole("button", { name: "ذخیرهٔ یادداشت" }).click();
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText("در صف ارسال")).toBeVisible();

  await page.reload();
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText("در صف ارسال")).toBeVisible();

  const syncRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/v1/drafts") && request.method() === "POST",
  );
  await context.setOffline(false);
  const sentRequest = await syncRequest;
  const command = sentRequest.postDataJSON() as { entityId: string; text: string };
  expect(command.text).toBe(note);
  await expect(page.getByText("همگام شد")).toBeVisible();

  const response = await page.request.get(`/api/v1/drafts/${command.entityId}`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    id: command.entityId,
    text: note,
    status: "DRAFT",
  });

  await page.getByRole("button", { name: "تلاش دوباره برای همگام‌سازی" }).click();
  await expect(page.getByText("همگام شد")).toBeVisible();
});
