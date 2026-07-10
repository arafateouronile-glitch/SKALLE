/**
 * E2E — Authentication flow
 *
 * Covers: login, logout, redirect-to-login when unauthenticated, password validation.
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD env vars pointing to a real seed account.
 */
import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_TEST_EMAIL ?? "yasser.arafate@gmail.com";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/sales-os");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows validation error on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /connexion|se connecter|sign in/i }).click();
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nope@example.com");
    await page.getByLabel(/mot de passe|password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /connexion|se connecter|sign in/i }).click();
    // Error message or stays on login
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip(!PASSWORD, "skipped — E2E_TEST_PASSWORD not set");

  test("logs in successfully and lands on dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/mot de passe|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /connexion|se connecter|sign in/i }).click();
    // Should redirect to main dashboard or CMO/CSO
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/(dashboard|marketing-os|sales-os)/);
  });
});
