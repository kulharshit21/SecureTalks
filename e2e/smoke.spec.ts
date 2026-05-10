import { test, expect } from "@playwright/test";

test("landing mentions CipherSafe", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /CipherSafe/i })).toBeVisible();
});
