import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted by Vitest transform) ─────────────────────────────────────

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

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findFirst: vi.fn(() => mockWorkspace) },
    post: { create: vi.fn((args) => ({ id: "post-1", ...args.data, createdAt: new Date() })) },
  },
}));
vi.mock("@/lib/credits", () => ({ useCredits: vi.fn() }));
vi.mock("@/lib/ai/langchain", () => ({
  getClaude: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: "{}" }),
  })),
  getStringParser: vi.fn(() => ({ invoke: vi.fn() })),
}));

// ─── Imports (after mocks — Vitest hoists vi.mock above) ─────────────────────

import { auth } from "@/lib/auth";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockSession = { user: { id: "user-1" } };
const CREDITS_OK = { success: true, remainingCredits: 50 };
const CREDITS_FAIL = { success: false, remainingCredits: 0, error: "Crédits insuffisants" };

const GENERATE_JSON = JSON.stringify({
  post: "J'ai failli perdre mon meilleur client. À cause d'une virgule dans un email.\n\nCe jour-là, j'ai compris que la prospection, c'est d'abord de l'écriture.\n\n#prospection #b2b #sales",
  hooks: [
    "La plupart des équipes commerciales font l'inverse de ce qu'elles devraient.",
    "J'ai mis 2 ans à comprendre ce qui tue les pipelines B2B.",
    "Tu envoies encore des cold emails génériques ? Voilà pourquoi personne ne répond.",
  ],
  firstComment: "📎 Pour aller plus loin : le framework exact que j'utilise → lien en bio.",
});

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

const HOOKS_JSON = JSON.stringify({
  hooks: [
    "La plupart des équipes font l'inverse de ce qu'elles devraient.",
    "J'ai mis 18 mois à comprendre cette erreur. 3 minutes suffisent.",
    "Tu fais encore des cold emails ? Voilà exactement pourquoi tu stagues.",
  ],
});

function makePost(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/social/linkedin/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── /api/social/linkedin/generate ───────────────────────────────────────────

import { POST as generatePOST } from "@/app/api/social/linkedin/generate/route";

describe("POST /api/social/linkedin/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue(CREDITS_OK);
    vi.mocked(getClaude).mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ content: GENERATE_JSON }),
    } as never);
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await generatePOST(makePost({ trigger: "curiosity_gap", subject: "lead scoring", format: "post_court" }));
    expect(res.status).toBe(401);
  });

  it("retourne 402 si crédits insuffisants", async () => {
    vi.mocked(useCredits).mockResolvedValue(CREDITS_FAIL);
    const res = await generatePOST(makePost({ trigger: "curiosity_gap", subject: "lead scoring", format: "post_court" }));
    expect(res.status).toBe(402);
  });

  it("retourne 400 si paramètres manquants", async () => {
    const res = await generatePOST(makePost({ trigger: "curiosity_gap" }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si subject vide", async () => {
    const res = await generatePOST(makePost({ trigger: "curiosity_gap", subject: "   ", format: "post_court" }));
    expect(res.status).toBe(400);
  });

  it("retourne 200 avec post, hooks et firstComment", async () => {
    const res = await generatePOST(makePost({ trigger: "curiosity_gap", subject: "le pipeline B2B qui se vide sans raison", format: "post_court" }));
    expect(res.status).toBe(200);
    const data = await res.json() as { post: string; hooks: string[]; firstComment: string };
    expect(data.post).toBeTruthy();
    expect(data.hooks).toHaveLength(3);
    expect(data.firstComment).toBeTruthy();
  });

  it("accepte tous les triggers valides", async () => {
    const triggers = ["curiosity_gap", "identity_validation", "tribal_belonging", "productive_discomfort", "aspiration", "status_signal"];
    for (const trigger of triggers) {
      const res = await generatePOST(makePost({ trigger, subject: "test subject long enough", format: "post_court" }));
      expect(res.status).toBe(200);
    }
  });

  it("accepte tous les formats valides", async () => {
    const formats = ["post_court", "storytelling", "listicle", "how_to", "contrarian"];
    for (const format of formats) {
      const res = await generatePOST(makePost({ trigger: "curiosity_gap", subject: "test subject long enough", format }));
      expect(res.status).toBe(200);
    }
  });
});

// ─── /api/social/linkedin/score ──────────────────────────────────────────────

import { POST as scorePOST } from "@/app/api/social/linkedin/score/route";

describe("POST /api/social/linkedin/score", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue(CREDITS_OK);
    vi.mocked(getClaude).mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ content: SCORE_JSON }),
    } as never);
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await scorePOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test suffisamment long pour être analysé." }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si post vide", async () => {
    const res = await scorePOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "" }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si post trop court", async () => {
    const res = await scorePOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Court." }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 402 si crédits insuffisants", async () => {
    vi.mocked(useCredits).mockResolvedValue(CREDITS_FAIL);
    const res = await scorePOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test suffisamment long pour être analysé dans ce système." }),
    }));
    expect(res.status).toBe(402);
  });

  it("retourne 200 avec score complet", async () => {
    const res = await scorePOST(new Request("http://localhost", {
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

import { POST as fromUrlPOST } from "@/app/api/social/linkedin/from-url/route";

describe("POST /api/social/linkedin/from-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue(CREDITS_OK);
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await fromUrlPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si URL manquante", async () => {
    const res = await fromUrlPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si URL invalide (pas http)", async () => {
    const res = await fromUrlPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "javascript:alert(1)" }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si URL invalide (format)", async () => {
    const res = await fromUrlPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "pas-une-url" }),
    }));
    expect(res.status).toBe(400);
  });
});

// ─── /api/social/linkedin/hooks ──────────────────────────────────────────────

import { POST as hooksPOST } from "@/app/api/social/linkedin/hooks/route";

describe("POST /api/social/linkedin/hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(useCredits).mockResolvedValue(CREDITS_OK);
    vi.mocked(getClaude).mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ content: HOOKS_JSON }),
    } as never);
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await hooksPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: "Un post de test pour générer des hooks alternatifs." }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si post manquant", async () => {
    const res = await hooksPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 200 avec exactement 3 hooks", async () => {
    const res = await hooksPOST(new Request("http://localhost", {
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

import { POST as postsPOST } from "@/app/api/social/posts/route";

describe("POST /api/social/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("retourne 401 si non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await postsPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LINKEDIN", content: "Test" }),
    }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si type invalide", async () => {
    const res = await postsPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "TIKTOK_UNKNOWN", content: "Test" }),
    }));
    expect(res.status).toBe(400);
  });

  it("retourne 400 si content manquant", async () => {
    const res = await postsPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LINKEDIN" }),
    }));
    expect(res.status).toBe(400);
  });

  it("crée un post DRAFT et retourne 201", async () => {
    const res = await postsPOST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LINKEDIN", content: "Mon post LinkedIn de test.", title: "Test" }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json() as { post: { status: string } };
    expect(data.post.status).toBe("DRAFT");
  });
});
