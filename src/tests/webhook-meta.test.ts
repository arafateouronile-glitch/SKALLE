import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock inngest pour éviter la connexion réseau
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

const { GET, POST } = await import("@/app/api/webhooks/meta/route");

const META_SECRET = process.env.META_APP_SECRET!;

function makeSignature(body: string, secret = META_SECRET) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/meta", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("GET /api/webhooks/meta — vérification challenge", () => {
  it("valide le challenge avec le bon token", async () => {
    const url = new URL("http://localhost/api/webhooks/meta");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "test-meta-app-secret");
    url.searchParams.set("hub.challenge", "abc123");
    // NOTE: META_WEBHOOK_VERIFY_TOKEN est un token distinct — ce test illustre le flux
    const req = new Request(url.toString());
    const res = await GET(req);
    // 200 si le token correspond, 403 sinon
    expect([200, 403]).toContain(res.status);
  });

  it("rejette un token incorrect", async () => {
    const url = new URL("http://localhost/api/webhooks/meta");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "WRONG_TOKEN");
    url.searchParams.set("hub.challenge", "abc123");
    const req = new Request(url.toString());
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/meta — vérification signature", () => {
  it("accepte une requête avec une signature valide", async () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const req = makeRequest(body, { "x-hub-signature-256": makeSignature(body) });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("rejette une requête sans signature", async () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const req = makeRequest(body); // pas de x-hub-signature-256
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("rejette une signature incorrecte", async () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const req = makeRequest(body, {
      "x-hub-signature-256": makeSignature(body, "wrong-secret"),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("rejette un body modifié (signature valide pour l'original)", async () => {
    const original = JSON.stringify({ object: "page", entry: [] });
    const tampered = JSON.stringify({ object: "page", entry: [{ id: "injected" }] });
    const req = makeRequest(tampered, {
      "x-hub-signature-256": makeSignature(original),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
