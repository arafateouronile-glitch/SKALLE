/**
 * Playwright fixtures: authenticated page context.
 *
 * Uses NextAuth credentials sign-in to seed session cookies so each test
 * starts already logged in, without repeating the login UI flow.
 */
import { test as base, expect, type Page } from "@playwright/test";

const EMAIL    = process.env.E2E_TEST_EMAIL    ?? "yasser.arafate@gmail.com";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

async function loginViaUI(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/mot de passe|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter|sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    if (PASSWORD) await loginViaUI(page);
    await use(page);
  },
});

export { expect };
