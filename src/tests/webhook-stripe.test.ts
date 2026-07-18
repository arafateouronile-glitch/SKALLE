import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Env requis avant le chargement de la route (const module-level) ─────────
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { retrieveSubscriptionMock } = vi.hoisted(() => ({
  retrieveSubscriptionMock: vi.fn(),
}));

// La vérification cryptographique de signature est la responsabilité du SDK
// Stripe (déjà testée par Stripe) — on la bypass pour tester notre logique
// métier (dispatch d'événements → setUserPlan), pas la crypto de Stripe.
vi.mock("stripe", () => {
  class MockStripe {
    webhooks = {
      constructEvent: (body: string, signature: string) => {
        if (signature === "invalid-signature") {
          throw new Error("Invalid signature");
        }
        return JSON.parse(body);
      },
    };
    subscriptions = {
      retrieve: retrieveSubscriptionMock,
    };
  }
  return { default: MockStripe };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn(() => Promise.resolve({})),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    workspace: {
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    quickPaymentLink: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    prospect: {
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
  },
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");
const { prisma } = await import("@/lib/prisma");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(event: unknown, signature = "valid-signature") {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body: JSON.stringify(event),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Signature ──────────────────────────────────────────────────────────────

describe("POST /api/webhooks/stripe — signature", () => {
  it("rejette une requête sans en-tête stripe-signature", async () => {
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejette une signature invalide", async () => {
    const req = makeRequest({ type: "checkout.session.completed" }, "invalid-signature");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── Nouvel abonnement — ne touche jamais hasCsoAccess (accès dérivé du plan) ─

describe("POST /api/webhooks/stripe — checkout.session.completed (abonnement)", () => {
  it("upgrade le plan et les crédits, sans écrire hasCsoAccess", async () => {
    const req = makeRequest({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          metadata: { skalleUserId: "user-1", plan: "BUSINESS" },
        },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "BUSINESS", credits: 600 },
    });
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — customer.subscription.updated", () => {
  it("met à jour plan + crédits pour un abonnement actif", async () => {
    const req = makeRequest({
      type: "customer.subscription.updated",
      data: {
        object: { status: "active", metadata: { skalleUserId: "user-1", plan: "AGENCY" } },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "AGENCY", credits: 2000 },
    });
  });

  it("ignore un abonnement qui n'est pas actif", async () => {
    const req = makeRequest({
      type: "customer.subscription.updated",
      data: {
        object: { status: "past_due", metadata: { skalleUserId: "user-1", plan: "AGENCY" } },
      },
    });
    await POST(req);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

// ─── Downgrade — le test qui valide directement le fix de la gate CSO ────────

describe("POST /api/webhooks/stripe — customer.subscription.deleted (downgrade)", () => {
  it("repasse le plan à FREE, 100 crédits, et révoque le flag hasCsoAccess legacy", async () => {
    const req = makeRequest({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { skalleUserId: "user-1" } } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "FREE", credits: 100 },
    });
    expect(prisma.workspace.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { hasCsoAccess: false },
    });
  });

  it("retrouve l'utilisateur via stripeCustomerId si les metadata sont absentes", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: "user-2" } as never);
    const req = makeRequest({
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_123", metadata: {} } },
    });
    await POST(req);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
      select: { id: true },
    });
    expect(prisma.workspace.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-2" },
      data: { hasCsoAccess: false },
    });
  });
});

// ─── Renouvellement — ne doit jamais toucher hasCsoAccess ────────────────────

describe("POST /api/webhooks/stripe — invoice.paid", () => {
  it("réinitialise les crédits mensuels sans jamais toucher hasCsoAccess", async () => {
    retrieveSubscriptionMock.mockResolvedValueOnce({
      metadata: { skalleUserId: "user-1", plan: "SCALE" },
    });
    const req = makeRequest({
      type: "invoice.paid",
      data: { object: { subscription: "sub_123" } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { credits: 6000 },
    });
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
  });
});
