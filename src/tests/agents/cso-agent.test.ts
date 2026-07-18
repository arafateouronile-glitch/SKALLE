import { describe, it, expect, vi } from "vitest";

// ─── Mocks des dépendances lourdes (LLM, budget, enrichissement) ──────────────
// observePipeline() n'utilise que prisma, mais le module importe le reste au
// chargement — on mocke tout pour garder le test rapide et hermétique.
vi.mock("@/lib/ai/langchain", () => ({
  getClaude: vi.fn(() => ({ invoke: vi.fn() })),
  getStringParser: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock("@/lib/ai/budget-guard", () => ({
  checkBudget: vi.fn(() => ({ allowed: true })),
  trackSpend: vi.fn(),
}));

vi.mock("@/lib/services/social/prospector", () => ({
  warmSignalLabel: vi.fn(() => "signal entrant"),
}));

vi.mock("@/lib/prospection/prospect-researcher", () => ({
  researchProspectsBatch: vi.fn(() => new Map()),
}));

vi.mock("@/lib/prospection/message-generator", () => ({
  generateCsoMessages: vi.fn(),
  buildBrandContext: vi.fn(() => ({})),
}));

vi.mock("@/lib/services/smart-sequence-processor", () => ({
  FAR_FUTURE: new Date("2099-01-01T00:00:00.000Z"),
}));

vi.mock("@/lib/services/apollo-client", () => ({
  getApolloApiKey: vi.fn(),
  apolloEnrichPerson: vi.fn(),
}));

// ─── Fausse table Prospect + matcher Prisma minimal ───────────────────────────
// Ne reproduit PAS toute la sémantique Prisma — uniquement les clauses que
// observePipeline() construit réellement : workspaceId, status.in, et le
// OR [{ personaId: { in } }, { warmSignalAt: { gte } }].
interface FakeProspect {
  id: string;
  workspaceId: string;
  status: string;
  personaId: string | null;
  warmSignalAt: Date | null;
  warmSignalType: string | null;
  score: number;
  name: string;
  company: string;
  jobTitle: string | null;
  email: string | null;
  linkedInUrl: string | null;
  enrichmentData: null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesWhere(p: FakeProspect, where: any): boolean {
  if (where.workspaceId && p.workspaceId !== where.workspaceId) return false;
  if (where.status?.in && !where.status.in.includes(p.status)) return false;
  if (where.OR) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchesOr = where.OR.some((cond: any) => {
      if (cond.personaId?.in) return p.personaId !== null && cond.personaId.in.includes(p.personaId);
      if (cond.warmSignalAt?.gte) {
        return p.warmSignalAt !== null && p.warmSignalAt.getTime() >= cond.warmSignalAt.gte.getTime();
      }
      return false;
    });
    if (!matchesOr) return false;
  } else if (where.personaId?.in) {
    // Forme "buggée" pré-fix : personaFilter direct, non enveloppé dans OR.
    if (p.personaId === null || !where.personaId.in.includes(p.personaId)) return false;
  }
  return true;
}

const { state } = vi.hoisted(() => ({
  state: {
    prospects: [] as FakeProspect[],
    activePersonas: [] as Array<{ id: string }>,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    persona: { findMany: vi.fn(() => state.activePersonas) },
    prospect: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: vi.fn((args: any) => {
        const filtered = state.prospects
          .filter((p) => matchesWhere(p, args.where))
          .sort((a, b) => b.score - a.score);
        return args.take ? filtered.slice(0, args.take) : filtered;
      }),
    },
    sequenceStep: { findMany: vi.fn(() => []) },
  },
}));

import { observePipeline } from "@/lib/services/sales/cso-agent";

describe("observePipeline — filtre persona vs signal chaud (régression)", () => {
  const WORKSPACE_ID = "ws-1";
  const base: Omit<FakeProspect, "id" | "personaId" | "warmSignalAt" | "warmSignalType" | "score"> = {
    workspaceId: WORKSPACE_ID,
    status: "NEW",
    name: "Prospect",
    company: "Acme",
    jobTitle: null,
    email: null,
    linkedInUrl: "https://linkedin.com/in/test",
    enrichmentData: null,
  };

  it("sans persona actif, tous les prospects NEW remontent (comportement inchangé)", async () => {
    state.activePersonas = [];
    state.prospects = [
      { ...base, id: "p-a", personaId: null, warmSignalAt: null, warmSignalType: null, score: 90 },
      { ...base, id: "p-b", personaId: null, warmSignalAt: null, warmSignalType: null, score: 40 },
    ];

    const obs = await observePipeline(WORKSPACE_ID);
    const ids = obs.highScoreNew.map((p) => p.id);

    expect(ids).toContain("p-a");
    expect(ids).toContain("p-b");
  });

  it("avec un persona actif, un prospect sans persona MAIS avec un signal chaud récent reste visible", async () => {
    state.activePersonas = [{ id: "persona-1" }];
    state.prospects = [
      { ...base, id: "p-icp", personaId: "persona-1", warmSignalAt: null, warmSignalType: null, score: 80 },
      { ...base, id: "p-warm", personaId: null, warmSignalAt: new Date(), warmSignalType: "PROFILE_VIEW", score: 68 },
      { ...base, id: "p-cold-no-persona", personaId: null, warmSignalAt: null, warmSignalType: null, score: 95 },
    ];

    const obs = await observePipeline(WORKSPACE_ID);
    const ids = obs.highScoreNew.map((p) => p.id);

    // Le fix : un lead chaud sans persona ne doit PAS disparaître.
    expect(ids).toContain("p-warm");
    // Le ciblage ICP reste actif pour le reste de la prospection froide.
    expect(ids).toContain("p-icp");
    expect(ids).not.toContain("p-cold-no-persona");

    const warm = obs.highScoreNew.find((p) => p.id === "p-warm");
    expect(warm?.warmSignalType).toBe("PROFILE_VIEW");
  });

  it("un signal chaud vieux de plus de 14 jours ne bypass plus le ciblage persona", async () => {
    state.activePersonas = [{ id: "persona-1" }];
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    state.prospects = [
      { ...base, id: "p-stale-warm", personaId: null, warmSignalAt: twentyDaysAgo, warmSignalType: "FOLLOW", score: 63 },
    ];

    const obs = await observePipeline(WORKSPACE_ID);
    const ids = obs.highScoreNew.map((p) => p.id);

    expect(ids).not.toContain("p-stale-warm");
  });
});
