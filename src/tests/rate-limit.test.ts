import { describe, it, expect, beforeEach, vi } from "vitest";

// Forcer le fallback in-memory en supprimant les variables Upstash
vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

const { checkAuthRateLimit, checkApiRateLimit } = await import("@/lib/rate-limit");

describe("Rate limiter (in-memory fallback)", () => {
  describe("checkAuthRateLimit — 10 req / 15 min", () => {
    it("autorise les premières requêtes", async () => {
      const ip = `test-auth-${Date.now()}`;
      const result = await checkAuthRateLimit(ip);
      expect(result.success).toBe(true);
      expect(result.reset).toBeGreaterThan(Date.now());
    });

    it("bloque après 10 tentatives", async () => {
      const ip = `test-auth-limit-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        await checkAuthRateLimit(ip);
      }
      const blocked = await checkAuthRateLimit(ip);
      expect(blocked.success).toBe(false);
    });

    it("isole les IPs différentes", async () => {
      const ip1 = `test-iso-1-${Date.now()}`;
      const ip2 = `test-iso-2-${Date.now()}`;
      for (let i = 0; i < 10; i++) await checkAuthRateLimit(ip1);

      const result = await checkAuthRateLimit(ip2);
      expect(result.success).toBe(true);
    });
  });

  describe("checkApiRateLimit — 60 req / min", () => {
    it("autorise les premières requêtes", async () => {
      const ip = `test-api-${Date.now()}`;
      const result = await checkApiRateLimit(ip);
      expect(result.success).toBe(true);
    });

    it("bloque après 60 requêtes", async () => {
      const ip = `test-api-limit-${Date.now()}`;
      for (let i = 0; i < 60; i++) {
        await checkApiRateLimit(ip);
      }
      const blocked = await checkApiRateLimit(ip);
      expect(blocked.success).toBe(false);
    });
  });
});
