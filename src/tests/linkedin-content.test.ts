import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const mockSession = { user: { id: "user-1" } };
const mockWorkspace = {
  id: "ws-1",
  name: "Acme SaaS",
  domainUrl: "acme.io",
  brandVoice: {
    tone: "direct",
    niche: "SaaS B2B",
    contentPillars: ["prospection", "growth"],
    valueProposition: "Close faster",
    targetPersona: "VP Sales",
  },
};

const VALID_JSON_RESPONSE = JSON.stringify({
  post: "J'ai failli perdre mon meilleur client. À cause d'une virgule dans un email.\n\nCe jour-là, j'ai compris que la prospection, c'est d'abord de l'écriture.\n\nVoici ce que j'ai changé.\n\n#prospection #b2b #sales",
  hooks: [
    "La plupart des équipes commerciales font l'inverse de ce qu'elles devraient.",
    "J'ai mis 2 ans à comprendre ce qui tue les pipelines B2B.",
    "Tu envoies encore des cold emails génériques ? Voilà pourquoi personne ne répond.",
  ],
  firstComment: "📎 Pour aller plus loin : le framework exact que j'utilise → lien en bio. Tu as vécu la même chose ?",
});

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findFirst: vi.fn(() => mockWorkspace) },
  },
}));
vi.mock("@/lib/credits", () => ({ useCredits: vi.fn() }));
vi.mock("@/lib/ai/langchain", () => ({
  getClaude: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: VALID_JSON_RESPONSE }),
  })),
  getStringParser: vi.fn(() => ({ invoke: vi.fn() })),
}));

function makePost(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/social/linkedin/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── /api/social/linkedin/generate ───────────────────────────────────────────

describe("POST /api/social/linkedin/generate", () => {
  const { auth } = await import("@/lib/auth");
  const { useCredits } = await import("@/lib/credits");
  const { POST } = await import("@/app/api/social/linkedin/generate/route");

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, currentCredits: 50, cost: 3 });
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePost({ trigger: "curiosity_gap", subject: "lead scoring", format: "post_court" }));
    expect(res.status).toBe(401);
  });

  it("retourne 402 si crédits insuffisants", async () => {
    vi.mocked(useCredits).mockResolvedValue({ success: false, currentCredits: 0, cost: 3 });
    const res = await POST(makePost({ trigger: "curiosity_gap", subject: "lead scoring", format: "post_court" }));
    expect(res.status).toBe(402);
  });

  it("retourne 400 si paramètres manquants", async () => {
    const res = await POST(makePost({ trigger: "curiosity_gap" }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si subject vide", async () => {
    const res = await POST(makePost({ trigger: "curiosity_gap", subject: "   ", format: "post_court" }));
    expect(res.status).toBe(400);
  });

  it("retourne 200 avec post, hooks et firstComment", async () => {
    const res = await POST(makePost({ trigger: "curiosity_gap", subject: "le pipeline B2B qui se vide sans raison", format: "post_court" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { post: string; hooks: string[]; firstComment: string };
    expect(data.post).toBeTruthy();
    expect(data.hooks).toHaveLength(3);
    expect(data.firstComment).toBeTruthy();
  });

  it("accepte tous les triggers valides", async () => {
    const triggers = ["curiosity_gap", "identity_validation", "tribal_belonging", "productive_discomfort", "aspiration", "status_signal"];
    for (const trigger of triggers) {
      const res = await POST(makePost({ trigger, subject: "test subject long enough", format: "post_court" }));
      expect(res.status).toBe(200);
    }
  });

  it("accepte tous les formats valides", async () => {
    const formats = ["post_court", "storytelling", "listicle", "how_to", "contrarian"];
    for (const format of formats) {
      const res = await POST(makePost({ trigger: "curiosity_gap", subject: "test subject long enough", format }));
      expect(res.status).toBe(200);
    }
  });
});

// ─── /api/social/linkedin/score ──────────────────────────────────────────────

describe("POST /api/social/linkedin/score", () => {
  const SCORE_JSON = JSON.stringify({
    globalScore: 74,
    dimensions: {
      hook:           { score: 8, label: "Hook fort",    explanation: "Pattern interrupt efficace.", suggestion: undefined },
      readability:    { score: 7, label: "Bonne lisib.", explanation: "Format propre.",              suggestion: undefined },
      valueDensity:   { score: 7, label: "Valeur dense", explanation: "Insight actionnable.",        suggestion: undefined },
      cta:            { score: 5, label: "CTA faible",   explanation: "Trop générique.",             suggestion: "Poser une question spécifique." },
      nativeFormat:   { score: 8, label: "Natif",        explanation: "3 hashtags, pas de lien.",   suggestion: undefined },
      viralPotential: { score: 6, label: "Moyen",        explanation: "Peu clivant.",                suggestion: "Ajouter une opinion forte." },
    },
    topPriority: "cta",
    topPrioritySuggestion: "Remplacer par une question cible spécifique.",
    improvedCta: "Ton équipe fait la même erreur sur les follow-ups ?",
    verdict: "minor_fixes",
  });

  vi.mock("@/lib/ai/langchain", () => ({
    getClaude: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({ content: SCORE_JSON }),
    })),
    getStringParser: vi.fn(),
  }));

  const { auth } = await import("@/lib/auth");
  const { useCredits } = await import("@/lib/credits");
  const { POST } = await import("@/app/api/social/linkedin/score/route");

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, currentCredits: 50, cost: 1 });
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test suffisamment long pour être analysé." }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si post vide", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "" }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si post trop court", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Court." }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 402 si crédits insuffisants", async () => {
    vi.mocked(useCredits).mockResolvedValue({ success: false, currentCredits: 0, cost: 1 });
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test suffisamment long pour être analysé dans ce système." }),
    }));
    expect(res.status).toBe(402);
  });

  it("retourne 200 avec score complet", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "J'ai failli perdre mon meilleur client. À cause d'une virgule. Voilà ce que j'ai appris." }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as { globalScore: number; dimensions: object; verdict: string };
    expect(data.globalScore).toBeGreaterThanOrEqual(0);
    expect(data.globalScore).toBeLessThanOrEqual(100);
    expect(data.dimensions).toBeDefined();
    expect(["publish_now", "minor_fixes", "major_revision"]).toContain(data.verdict);
  });
});

// ─── /api/social/linkedin/from-url ───────────────────────────────────────────

describe("POST /api/social/linkedin/from-url", () => {
  const { auth } = await import("@/lib/auth");
  const { useCredits } = await import("@/lib/credits");

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, currentCredits: 50, cost: 3 });
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { POST } = await import("@/app/api/social/linkedin/from-url/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si URL manquante", async () => {
    const { POST } = await import("@/app/api/social/linkedin/from-url/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si URL invalide (pas http)", async () => {
    const { POST } = await import("@/app/api/social/linkedin/from-url/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "javascript:alert(1)" }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si URL invalide (format)", async () => {
    const { POST } = await import("@/app/api/social/linkedin/from-url/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "pas-une-url" }),
    }));
    expect(res.status).toBe(400);
  });
});

// ─── /api/social/linkedin/hooks ──────────────────────────────────────────────

describe("POST /api/social/linkedin/hooks", () => {
  const HOOKS_JSON = JSON.stringify({
    hooks: [
      "La plupart des équipes font l'inverse de ce qu'elles devraient.",
      "J'ai mis 18 mois à comprendre cette erreur. 3 minutes suffisent.",
      "Tu fais encore des cold emails ? Voilà exactement pourquoi tu stagues.",
    ],
  });

  vi.mock("@/lib/ai/langchain", () => ({
    getClaude: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({ content: HOOKS_JSON }),
    })),
    getStringParser: vi.fn(),
  }));

  const { auth } = await import("@/lib/auth");
  const { useCredits } = await import("@/lib/credits");
  const { POST } = await import("@/app/api/social/linkedin/hooks/route");

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue({ success: true, currentCredits: 50, cost: 1 });
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test pour générer des hooks alternatifs." }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si post manquant", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 200 avec exactement 3 hooks", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test suffisamment long pour générer des hooks." }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as { hooks: string[] };
    expect(data.hooks).toHaveLength(3);
    data.hooks.forEach((h) => expect(h.length).toBeGreaterThan(10));
  });
});

// ─── /api/social/posts (POST) ─────────────────────────────────────────────────

describe("POST /api/social/posts", () => {
  vi.mock("@/lib/prisma", () => ({
    prisma: {
      workspace: { findFirst: vi.fn(() => ({ id: "ws-1" })) },
      post: { create: vi.fn((args) => ({ id: "post-1", ...args.data, createdAt: new Date() })) },
    },
  }));

  const { auth } = await import("@/lib/auth");
  const { POST } = await import("@/app/api/social/posts/route");

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LINKEDIN", content: "Test" }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si type invalide", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "TIKTOK_UNKNOWN", content: "Test" }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si content manquant", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LINKEDIN" }),
    }));
    expect(res.status).toBe(400);
  });

  it("crée un post DRAFT et retourne 201", async () => {
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LINKEDIN", content: "Mon post LinkedIn de test.", title: "Test" }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json() as { post: { status: string } };
    expect(data.post.status).toBe("DRAFT");
  });
});
