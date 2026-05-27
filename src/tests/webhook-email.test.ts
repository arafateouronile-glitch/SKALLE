import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prospect: {
      updateMany: vi.fn(() => ({ count: 1 })),
    },
    sequenceStep: {
      updateMany: vi.fn(() => ({ count: 3 })),
    },
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

// ─── Import ───────────────────────────────────────────────────────────────────

import { POST } from "@/app/api/webhooks/email/route";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown, authHeader?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("http://localhost/api/webhooks/email", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMAIL_WEBHOOK_SECRET;
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("autorise la requête si EMAIL_WEBHOOK_SECRET non défini", async () => {
    const res = await POST(makeReq({ type: "bounced", email: "a@b.com" }));
    expect(res.status).toBe(200);
  });

  it("retourne 401 si Authorization header incorrect", async () => {
    process.env.EMAIL_WEBHOOK_SECRET = "secret123";
    const res = await POST(makeReq({ type: "bounced", email: "a@b.com" }, "Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("autorise avec le bon Bearer token", async () => {
    process.env.EMAIL_WEBHOOK_SECRET = "secret123";
    const res = await POST(makeReq({ type: "bounced", email: "a@b.com" }, "Bearer secret123"));
    expect(res.status).toBe(200);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("retourne 400 si body invalide JSON", async () => {
    const req = new Request("http://localhost/api/webhooks/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retourne 400 si type non reconnu", async () => {
    const res = await POST(makeReq({ type: "delivered", email: "a@b.com" }));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("type must be");
  });

  it("retourne 400 si type manquant", async () => {
    const res = await POST(makeReq({ email: "a@b.com" }));
    expect(res.status).toBe(400);
  });

  // ── bounced ────────────────────────────────────────────────────────────────

  it("bounced: met à jour emailStatus du prospect", async () => {
    const res = await POST(makeReq({ type: "bounced", email: "bounce@test.com" }));
    expect(res.status).toBe(200);
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith({
      where: { email: "bounce@test.com" },
      data: { emailStatus: "bounced" },
    });
  });

  it("bounced: ne stoppe pas les séquences (bounce ≠ désabonnement)", async () => {
    await POST(makeReq({ type: "bounced", email: "bounce@test.com" }));
    expect(prisma.sequenceStep.updateMany).not.toHaveBeenCalled();
  });

  it("bounced: envoie un événement Inngest si stepId fourni", async () => {
    await POST(makeReq({ type: "bounced", email: "bounce@test.com", stepId: "step-123" }));
    expect(inngest.send).toHaveBeenCalledWith({
      name: "email/event",
      data: { stepId: "step-123", eventType: "bounced" },
    });
  });

  // ── spam_complaint ─────────────────────────────────────────────────────────

  it("spam_complaint: met à jour emailStatus", async () => {
    const res = await POST(makeReq({ type: "spam_complaint", email: "spam@test.com" }));
    expect(res.status).toBe(200);
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith({
      where: { email: "spam@test.com" },
      data: { emailStatus: "spam_complaint" },
    });
  });

  it("spam_complaint: stoppe les séquences email PENDING", async () => {
    await POST(makeReq({ type: "spam_complaint", email: "spam@test.com" }));
    expect(prisma.sequenceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SKIPPED" } })
    );
  });

  // ── unsubscribed ───────────────────────────────────────────────────────────

  it("unsubscribed: met à jour emailStatus", async () => {
    const res = await POST(makeReq({ type: "unsubscribed", email: "unsub@test.com" }));
    expect(res.status).toBe(200);
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith({
      where: { email: "unsub@test.com" },
      data: { emailStatus: "unsubscribed" },
    });
  });

  it("unsubscribed: stoppe les séquences email PENDING", async () => {
    await POST(makeReq({ type: "unsubscribed", email: "unsub@test.com" }));
    expect(prisma.sequenceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SKIPPED" } })
    );
  });

  // ── Sans email (stepId only) ───────────────────────────────────────────────

  it("fonctionne sans email si stepId fourni", async () => {
    const res = await POST(makeReq({ type: "bounced", stepId: "step-456" }));
    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledOnce();
    expect(prisma.prospect.updateMany).not.toHaveBeenCalled();
  });

  // ── normalisation email ────────────────────────────────────────────────────

  it("normalise l'email en lowercase", async () => {
    await POST(makeReq({ type: "bounced", email: "UPPER@TEST.COM" }));
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith({
      where: { email: "upper@test.com" },
      data: { emailStatus: "bounced" },
    });
  });
});
