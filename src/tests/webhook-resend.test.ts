import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prospect: {
      updateMany: vi.fn(() => ({ count: 1 })),
      findMany: vi.fn(() => [{ workspaceId: "ws-1" }, { workspaceId: "ws-2" }]),
    },
    sequenceStep: {
      updateMany: vi.fn(() => ({ count: 2 })),
    },
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/lib/prospection/deliverability", () => ({
  trackEmailMetrics: vi.fn(() => Promise.resolve()),
}));

// ─── Import ───────────────────────────────────────────────────────────────────

import { POST } from "@/app/api/webhooks/resend/route";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { trackEmailMetrics } from "@/lib/prospection/deliverability";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET_RAW = "test-secret-bytes-32-chars-long!";
const TEST_SECRET_B64 = Buffer.from(TEST_SECRET_RAW).toString("base64");
const TEST_SECRET_ENV = `whsec_${TEST_SECRET_B64}`;

function makeUnsignedReq(body: unknown) {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSignedReq(body: unknown, secret = TEST_SECRET_ENV, ageMod = 0) {
  const rawBody = JSON.stringify(body);
  const svixId = "msg_01jtest";
  const svixTimestamp = String(Math.floor(Date.now() / 1000) + ageMod);
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = createHmac("sha256", secretBytes).update(toSign).digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": `v1,${sig}`,
    },
    body: rawBody,
  });
}

const BOUNCED_EVENT = {
  type: "email.bounced",
  created_at: new Date().toISOString(),
  data: { email_id: "email-abc", to: ["user@example.com"], from: "hello@test.com", subject: "Hello" },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  // ── Signature verification ────────────────────────────────────────────────

  it("accepte sans vérification si RESEND_WEBHOOK_SECRET absent", async () => {
    const res = await POST(makeUnsignedReq(BOUNCED_EVENT));
    expect(res.status).toBe(200);
  });

  it("retourne 400 si svix headers manquants quand secret défini", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET_ENV;
    const res = await POST(makeUnsignedReq(BOUNCED_EVENT));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("svix");
  });

  it("retourne 400 si timestamp expiré (> 5 min)", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET_ENV;
    const res = await POST(makeSignedReq(BOUNCED_EVENT, TEST_SECRET_ENV, -400));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("old");
  });

  it("retourne 401 si signature invalide", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET_ENV;
    const rawBody = JSON.stringify(BOUNCED_EVENT);
    const req = new Request("http://localhost/api/webhooks/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_fake",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalidsignaturehere==",
      },
      body: rawBody,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepte avec une signature valide", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET_ENV;
    const res = await POST(makeSignedReq(BOUNCED_EVENT));
    expect(res.status).toBe(200);
  });

  // ── Événements non gérés ─────────────────────────────────────────────────

  it("ignore silencieusement les événements inconnus (email.sent)", async () => {
    const res = await POST(makeUnsignedReq({ type: "email.sent", created_at: new Date().toISOString(), data: {} }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; skipped: string };
    expect(body.skipped).toBe("email.sent");
    expect(prisma.prospect.updateMany).not.toHaveBeenCalled();
  });

  it("retourne 400 si JSON invalide", async () => {
    const req = new Request("http://localhost/api/webhooks/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not{json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── email.bounced ─────────────────────────────────────────────────────────

  it("bounced: met à jour emailStatus=bounced pour chaque destinataire", async () => {
    const res = await POST(makeUnsignedReq(BOUNCED_EVENT));
    expect(res.status).toBe(200);
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: { emailStatus: "bounced" },
    });
  });

  it("bounced: ne stoppe pas les séquences", async () => {
    await POST(makeUnsignedReq(BOUNCED_EVENT));
    expect(prisma.sequenceStep.updateMany).not.toHaveBeenCalled();
  });

  it("bounced: envoie un événement Inngest avec l'email_id", async () => {
    await POST(makeUnsignedReq(BOUNCED_EVENT));
    expect(inngest.send).toHaveBeenCalledWith({
      name: "email/event",
      data: { stepId: "email-abc", eventType: "bounced" },
    });
  });

  it("bounced: n'envoie pas d'événement Inngest si email_id absent", async () => {
    const event = { ...BOUNCED_EVENT, data: { ...BOUNCED_EVENT.data, email_id: undefined } };
    await POST(makeUnsignedReq(event));
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("bounced: appelle trackEmailMetrics par workspace", async () => {
    await POST(makeUnsignedReq(BOUNCED_EVENT));
    expect(trackEmailMetrics).toHaveBeenCalledWith("ws-1", "bounced");
    expect(trackEmailMetrics).toHaveBeenCalledWith("ws-2", "bounced");
  });

  // ── email.complained (spam) ───────────────────────────────────────────────

  it("complained: met à jour emailStatus=spam_complaint", async () => {
    const event = { ...BOUNCED_EVENT, type: "email.complained", data: { ...BOUNCED_EVENT.data } };
    await POST(makeUnsignedReq(event));
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailStatus: "spam_complaint" } })
    );
  });

  it("complained: stoppe les séquences PENDING", async () => {
    const event = { ...BOUNCED_EVENT, type: "email.complained" };
    await POST(makeUnsignedReq(event));
    expect(prisma.sequenceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SKIPPED" } })
    );
  });

  it("complained: appelle trackEmailMetrics avec 'spam'", async () => {
    const event = { ...BOUNCED_EVENT, type: "email.complained" };
    await POST(makeUnsignedReq(event));
    expect(trackEmailMetrics).toHaveBeenCalledWith("ws-1", "spam");
  });

  // ── email.unsubscribed ────────────────────────────────────────────────────

  it("unsubscribed: met à jour emailStatus=unsubscribed", async () => {
    const event = { ...BOUNCED_EVENT, type: "email.unsubscribed" };
    await POST(makeUnsignedReq(event));
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailStatus: "unsubscribed" } })
    );
  });

  it("unsubscribed: stoppe les séquences PENDING", async () => {
    const event = { ...BOUNCED_EVENT, type: "email.unsubscribed" };
    await POST(makeUnsignedReq(event));
    expect(prisma.sequenceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SKIPPED" } })
    );
  });

  it("unsubscribed: appelle trackEmailMetrics avec 'unsubscribed'", async () => {
    const event = { ...BOUNCED_EVENT, type: "email.unsubscribed" };
    await POST(makeUnsignedReq(event));
    expect(trackEmailMetrics).toHaveBeenCalledWith("ws-1", "unsubscribed");
  });

  // ── Normalisation email ───────────────────────────────────────────────────

  it("normalise les emails en lowercase", async () => {
    const event = { ...BOUNCED_EVENT, data: { ...BOUNCED_EVENT.data, to: ["UPPER@EXAMPLE.COM"] } };
    await POST(makeUnsignedReq(event));
    expect(prisma.prospect.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "upper@example.com" } })
    );
  });

  // ── Plusieurs destinataires ────────────────────────────────────────────────

  it("traite chaque destinataire indépendamment", async () => {
    const event = {
      ...BOUNCED_EVENT,
      data: { ...BOUNCED_EVENT.data, to: ["a@test.com", "b@test.com"] },
    };
    await POST(makeUnsignedReq(event));
    expect(prisma.prospect.updateMany).toHaveBeenCalledTimes(2);
  });

  // ── Réponse OK ────────────────────────────────────────────────────────────

  it("retourne { ok: true, type, affected } en cas de succès", async () => {
    const res = await POST(makeUnsignedReq(BOUNCED_EVENT));
    const body = await res.json() as { ok: boolean; type: string; affected: number };
    expect(body.ok).toBe(true);
    expect(body.type).toBe("bounced");
    expect(body.affected).toBe(1);
  });
});
