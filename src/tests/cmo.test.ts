import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSession = { user: { id: "user-1", email: "test@test.com" } };

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const mockProposal = {
  id: "prop-1",
  workspaceId: "ws-1",
  objectiveId: null,
  type: "GENERATE_POSTS",
  title: "30 posts LinkedIn",
  description: "Batch LinkedIn",
  agentReason: "Objectif contenu",
  payload: { niche: "SaaS", networks: ["LINKEDIN"], icp: {}, count: 6 },
  status: "PENDING",
  userFeedback: null,
  result: null,
  creditsEst: 15,
  createdAt: new Date("2026-05-27"),
  updatedAt: new Date("2026-05-27"),
  objective: null,
};

const mockObjective = {
  id: "obj-1",
  workspaceId: "ws-1",
  type: "CONTENT",
  period: "MONTHLY",
  title: "30 posts/mois",
  description: null,
  target: { metric: "posts", value: 30, unit: "posts" },
  status: "ACTIVE",
  startDate: new Date("2026-05-01"),
  endDate: null,
  createdAt: new Date("2026-05-01"),
  updatedAt: new Date("2026-05-01"),
  _count: { proposals: 0 },
};

const mockWorkspace = {
  id: "ws-1",
  name: "Skalle Test",
  brandVoice: { tone: "professionnel", niche: "SaaS B2B", icp: { role: "CMO" } },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findFirst: vi.fn(() => mockWorkspace),
      findUnique: vi.fn(() => mockWorkspace),
      update: vi.fn(),
    },
    cMOProposal: {
      findMany: vi.fn(() => [mockProposal]),
      findFirst: vi.fn(() => mockProposal),
      count: vi.fn(() => 0),
      createMany: vi.fn(() => ({ count: 2 })),
      update: vi.fn((args) => ({ ...mockProposal, ...args.data })),
      updateMany: vi.fn(() => ({ count: 1 })),
      groupBy: vi.fn(() => []),
    },
    cMOObjective: {
      findMany: vi.fn(() => [mockObjective]),
      create: vi.fn((args) => ({ id: "obj-new", ...args.data })),
      updateMany: vi.fn(() => ({ count: 1 })),
      deleteMany: vi.fn(() => ({ count: 1 })),
    },
    post: {
      findMany: vi.fn(() => []),
      count: vi.fn(() => 0),
      createMany: vi.fn(() => ({ count: 6 })),
      create: vi.fn((args) => ({ id: "post-1", ...args.data })),
      updateMany: vi.fn(() => ({ count: 3 })),
    },
    googleSearchConsoleConfig: {
      findUnique: vi.fn(() => null),
    },
    aPIUsage: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/ai/langchain", () => ({
  getClaude: vi.fn(() => ({
    invoke: vi.fn(() => "mock-response"),
  })),
  getStringParser: vi.fn(() => ({
    invoke: vi.fn(() =>
      JSON.stringify([
        { network: "LINKEDIN", hook: "Hook 1", content: "Content 1", hookType: "question", category: "thought" },
        { network: "LINKEDIN", hook: "Hook 2", content: "Content 2", hookType: "stat", category: "insight" },
      ])
    ),
  })),
}));

vi.mock("@/lib/services/seo/writer", () => ({
  generateEliteArticle: vi.fn(() => ({
    title: "Guide SEO SaaS",
    content: "<h1>Guide SEO</h1>",
    excerpt: "Un guide complet",
    metaTitle: "Guide SEO SaaS",
    metaDescription: "Description SEO",
    outline: { sections: [] },
    relatedKeywords: ["seo", "saas"],
    seoScore: 85,
    readabilityScore: 78,
    seoFeedback: [],
    faqContent: [],
    tableOfContents: [],
    wordCount: 2100,
    featuredImageUrl: null,
    sources: [],
    generatedImages: [],
  })),
}));

vi.mock("@/lib/services/notifications/admin", () => ({
  notifyAgentBrainDecision: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  useCredits: vi.fn(() => ({ success: true, remainingCredits: 500 })),
  CREDIT_COSTS: {
    cmo_generate_posts: 15,
    cmo_generate_article: 8,
    cmo_analyze: 2,
  },
}));

// ─── Imports routes ───────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { GET as getProposals } from "@/app/api/cmo/proposals/route";
import {
  GET as getObjectives,
  POST as postObjective,
} from "@/app/api/cmo/objectives/route";
import { POST as runAnalyze } from "@/app/api/cmo/agent/analyze/route";
import { POST as approveProposal } from "@/app/api/cmo/proposals/[id]/approve/route";
import { POST as rejectProposal } from "@/app/api/cmo/proposals/[id]/reject/route";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(url = "http://localhost", body?: unknown, method = body ? "POST" : "GET") {
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── GET /api/cmo/proposals ───────────────────────────────────────────────────

describe("GET /api/cmo/proposals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 sans session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await getProposals(makeReq());
    expect(res.status).toBe(401);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("Non autorisé");
  });

  it("retourne la liste des proposals avec session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    const res = await getProposals(makeReq("http://localhost/api/cmo/proposals"));
    expect(res.status).toBe(200);
    const data = await res.json() as { proposals: unknown[]; nextCursor: string | null };
    expect(Array.isArray(data.proposals)).toBe(true);
    expect(data).toHaveProperty("nextCursor");
  });

  it("filtre par status quand ?status=PENDING", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    await getProposals(makeReq("http://localhost/api/cmo/proposals?status=PENDING"));
    expect(prisma.cMOProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PENDING" }) })
    );
  });

  it("ignore un status invalide", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    await getProposals(makeReq("http://localhost/api/cmo/proposals?status=INVALID"));
    expect(prisma.cMOProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ status: expect.anything() }) })
    );
  });

  it("retourne proposals vides si pas de workspace", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.workspace.findFirst).mockResolvedValueOnce(null);
    const res = await getProposals(makeReq("http://localhost/api/cmo/proposals"));
    expect(res.status).toBe(200);
    const data = await res.json() as { proposals: unknown[] };
    expect(data.proposals).toEqual([]);
  });
});

// ─── GET /api/cmo/objectives ──────────────────────────────────────────────────

describe("GET /api/cmo/objectives", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 sans session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await getObjectives();
    expect(res.status).toBe(401);
  });

  it("retourne la liste des objectifs", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    const res = await getObjectives();
    expect(res.status).toBe(200);
    const data = await res.json() as { objectives: unknown[] };
    expect(Array.isArray(data.objectives)).toBe(true);
    expect(data.objectives).toHaveLength(1);
  });
});

// ─── POST /api/cmo/objectives ─────────────────────────────────────────────────

describe("POST /api/cmo/objectives", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 sans session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await postObjective(makeReq("http://localhost", {}));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si champs manquants", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    const res = await postObjective(makeReq("http://localhost", { type: "CONTENT" }));
    expect(res.status).toBe(400);
  });

  it("crée un objectif avec tous les champs requis", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    const body = {
      type: "CONTENT",
      period: "MONTHLY",
      title: "30 posts/mois",
      target: { metric: "posts", value: 30, unit: "posts" },
    };
    const res = await postObjective(makeReq("http://localhost", body));
    expect(res.status).toBe(201);
    const data = await res.json() as { objective: { id: string } };
    expect(data.objective).toBeDefined();
    expect(prisma.cMOObjective.create).toHaveBeenCalledOnce();
  });
});

// ─── POST /api/cmo/agent/analyze ──────────────────────────────────────────────

describe("POST /api/cmo/agent/analyze", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 sans session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await runAnalyze();
    expect(res.status).toBe(401);
  });

  it("retourne 400 sans objectifs actifs", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOObjective.findMany).mockResolvedValueOnce([]);
    const res = await runAnalyze();
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("objectif");
  });

  it("génère des proposals depuis les objectifs actifs", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOObjective.findMany).mockResolvedValueOnce([mockObjective] as never);

    // Mock LLM retourne un JSON valide
    const { getStringParser } = await import("@/lib/ai/langchain");
    vi.mocked(getStringParser).mockReturnValue({
      invoke: vi.fn(() =>
        JSON.stringify([
          {
            type: "GENERATE_POSTS",
            title: "30 posts LinkedIn",
            description: "Batch LinkedIn",
            agentReason: "Objectif manquant",
            payload: { niche: "SaaS", networks: ["LINKEDIN"], icp: {}, count: 30 },
            creditsEst: 15,
            objectiveId: mockObjective.id,
          },
        ])
      ),
    } as never);

    const res = await runAnalyze();
    expect(res.status).toBe(200);
    const data = await res.json() as { created: number };
    expect(data.created).toBeGreaterThanOrEqual(1);
    expect(prisma.cMOProposal.createMany).toHaveBeenCalledOnce();
  });
});

// ─── POST /api/cmo/proposals/[id]/reject ──────────────────────────────────────

describe("POST /api/cmo/proposals/[id]/reject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 sans session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await rejectProposal(makeReq("http://localhost", { feedback: "Pas pertinent" }), makeParams("prop-1"));
    expect(res.status).toBe(401);
  });

  it("rejette la proposal avec feedback", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    const res = await rejectProposal(
      makeReq("http://localhost", { feedback: "Pas le bon timing" }),
      makeParams("prop-1"),
    );
    expect(res.status).toBe(200);
    expect(prisma.cMOProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", userFeedback: "Pas le bon timing" }),
      })
    );
  });

  it("retourne 404 si proposal déjà traitée (count=0)", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.updateMany).mockResolvedValueOnce({ count: 0 });
    const res = await rejectProposal(makeReq("http://localhost", {}), makeParams("prop-inexistant"));
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/cmo/proposals/[id]/approve ─────────────────────────────────────

describe("POST /api/cmo/proposals/[id]/approve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne 401 sans session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    expect(res.status).toBe(401);
  });

  it("retourne 404 si proposal introuvable", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce(null);
    const res = await approveProposal(makeReq("http://localhost", {}), makeParams("prop-x"));
    expect(res.status).toBe(404);
  });

  it("retourne 400 si proposal déjà traitée", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce({
      ...mockProposal,
      status: "DONE",
    } as never);
    const res = await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    expect(res.status).toBe(400);
  });

  it("passe la proposal en IN_PROGRESS et retourne ok", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce(mockProposal as never);
    const res = await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; status: string };
    expect(data.ok).toBe(true);
    expect(data.status).toBe("IN_PROGRESS");
    expect(prisma.cMOProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IN_PROGRESS" }) })
    );
  });

  it("exécute ANALYZE et produit un résultat avec stats", async () => {
    const analyzeProp = { ...mockProposal, type: "ANALYZE", payload: { period: "30j", metrics: ["posts"] } };
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce(analyzeProp as never);
    vi.mocked(prisma.post.count).mockResolvedValue(10);
    const res = await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    expect(res.status).toBe(200);
    expect(prisma.cMOProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IN_PROGRESS" }) })
    );
  });

  it("déduit les crédits avant exécution de GENERATE_POSTS", async () => {
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce(mockProposal as never);
    await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    // useCredits est appelé dans la promesse void — on attend la résolution
    await new Promise((r) => setTimeout(r, 50));
    expect(useCredits).toHaveBeenCalledWith("user-1", "cmo_generate_posts");
  });

  it("passe la proposal en FAILED si crédits insuffisants", async () => {
    vi.mocked(useCredits).mockResolvedValueOnce({ success: false, remainingCredits: 0, error: "Crédits insuffisants" });
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce(mockProposal as never);
    await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    await new Promise((r) => setTimeout(r, 50));
    expect(prisma.cMOProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("n'appelle pas useCredits pour SCHEDULE_POSTS (gratuit)", async () => {
    const scheduleProp = { ...mockProposal, type: "SCHEDULE_POSTS", payload: { networks: ["LINKEDIN"], count: 3 } };
    vi.mocked(auth).mockResolvedValueOnce(mockSession as never);
    vi.mocked(prisma.cMOProposal.findFirst).mockResolvedValueOnce(scheduleProp as never);
    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }] as never);
    await approveProposal(makeReq("http://localhost", {}), makeParams("prop-1"));
    await new Promise((r) => setTimeout(r, 50));
    expect(useCredits).not.toHaveBeenCalled();
  });
});
