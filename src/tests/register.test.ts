import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique, create: mockCreate },
    workspace: { create: vi.fn().mockResolvedValue({}) },
    verificationToken: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual };
});

// Dynamic imports mockés (best-effort dans register/route.ts)
vi.mock("@/lib/services/notifications/admin", () => ({
  notifyNewSignup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/auth-email", () => ({
  sendEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("@/app/api/auth/register/route");

// ── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null); // aucun utilisateur existant par défaut
    mockCreate.mockResolvedValue({ id: "user-123", email: "test@example.com", name: "Test" });
  });

  describe("Validation", () => {
    it("rejette un body vide", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });

    it("rejette un email invalide", async () => {
      const res = await POST(makeRequest({ name: "Test", email: "pas-un-email", password: "password123" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/email/i);
    });

    it("rejette un mot de passe trop court (< 6 chars)", async () => {
      const res = await POST(makeRequest({ name: "Test", email: "test@example.com", password: "abc" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/mot de passe/i);
    });

    it("rejette un nom trop court (< 2 chars)", async () => {
      const res = await POST(makeRequest({ name: "A", email: "test@example.com", password: "password123" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/nom/i);
    });
  });

  describe("Logique métier", () => {
    it("crée un compte avec des données valides", async () => {
      const res = await POST(makeRequest({ name: "Test User", email: "new@example.com", password: "password123" }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.message).toContain("succès");
    });

    it("refuse si l'email est déjà utilisé", async () => {
      mockFindUnique.mockResolvedValue({ id: "existing", email: "taken@example.com" });
      const res = await POST(makeRequest({ name: "Test User", email: "taken@example.com", password: "password123" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/déjà utilisé/i);
    });

    it("ne stocke pas le mot de passe en clair", async () => {
      await POST(makeRequest({ name: "Test User", email: "new@example.com", password: "plaintext" }));
      const createCall = mockCreate.mock.calls[0]?.[0];
      expect(createCall?.data?.password).not.toBe("plaintext");
      expect(createCall?.data?.password).toMatch(/^\$2[ab]\$/); // bcrypt
    });
  });
});
