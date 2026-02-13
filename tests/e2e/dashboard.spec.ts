import { expect, test } from "@playwright/test";

test("dashboard shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Apple Watch Trends Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rescan" })).toBeVisible();
});
