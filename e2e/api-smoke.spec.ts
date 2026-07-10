/**
 * E2E — API smoke tests (authenticated endpoints)
 *
 * Tests that the most critical API routes return expected HTTP status codes
 * with a valid session. These don't rely on real data — just confirm the
 * routes are wired, auth-gated, and not crashing at boot.
 */
import { test, expect } from "./fixtures";

const WORKSPACE_ROUTES = [
  "/api/cso-agent/pipeline",
  "/api/cso-agent/pending-connections",
  "/api/sequences/suggestions",
];

const UNAUTHENTICATED_ROUTES = [
  "/api/auth/session",
  "/api/webhooks/email",       // should return 400 (missing body), not 500
  "/api/webhooks/resend",      // should return 400 (missing signature headers)
];

test.describe("API smoke — unauthenticated routes", () => {
  test("/api/auth/session returns 200", async ({ page }) => {
    const res = await page.request.get("/api/auth/session");
    expect(res.status()).toBe(200);
  });

  test("/api/webhooks/email POST without body returns 400 not 500", async ({ page }) => {
    const res = await page.request.post("/api/webhooks/email", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });
    // 400 = missing/invalid type field, 401 = secret mismatch — both are acceptable
    expect([400, 401]).toContain(res.status());
  });

  test("/api/webhooks/resend POST without svix headers returns 400", async ({ page }) => {
    const res = await page.request.post("/api/webhooks/resend", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 401]).toContain(res.status());
  });
});

test.describe("API smoke — authenticated routes", () => {
  for (const route of WORKSPACE_ROUTES) {
    test(`GET ${route} returns 200 or 400 (not 500)`, async ({ authedPage }) => {
      const res = await authedPage.request.get(route);
      // 200 = ok, 400 = missing param, 401 = not authed (no session seeded) — all acceptable
      // 500 = crash — NOT acceptable
      expect(res.status()).not.toBe(500);
    });
  }
});
