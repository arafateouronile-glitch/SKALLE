import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeProspect {
  id: string;
  status: string;
  value: number | null;
  attributedDecisionId: string | null;
  createdAt: Date;
}

const { state } = vi.hoisted(() => ({
  state: {
    prospects: [] as FakeProspect[],
    decisions: [] as Array<{ id: string; actionType: string }>,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prospect: {
      findMany: vi.fn(() => state.prospects),
    },
    agentDecision: {
      findMany: vi.fn((args: { where: { id: { in: string[] } } }) =>
        state.decisions.filter((d) => args.where.id.in.includes(d.id))
      ),
    },
  },
}));

import { getCsoROIDashboard } from "@/lib/services/analytics/cso-roi-tracking";

const WORKSPACE_ID = "ws-1";
const base = { status: "NEW", value: null, attributedDecisionId: null, createdAt: new Date() };

beforeEach(() => {
  state.prospects = [];
  state.decisions = [];
});

describe("getCsoROIDashboard", () => {
  it("retourne un rapport à zéro pour un workspace vide", async () => {
    const report = await getCsoROIDashboard(WORKSPACE_ID);
    expect(report.totalProspects).toBe(0);
    expect(report.totalConverted).toBe(0);
    expect(report.totalPipelineValue).toBe(0);
    expect(report.conversionRate).toBe(0);
    expect(report.attributionByOrigin.AI_AGENT.count).toBe(0);
    expect(report.attributionByOrigin.MANUAL.count).toBe(0);
    expect(report.pipelineByActionType).toEqual([]);
  });

  it("sépare correctement le pipeline IA du pipeline manuel", async () => {
    state.prospects = [
      { ...base, id: "p-ai-1", status: "CONVERTED", value: 1000, attributedDecisionId: "dec-1" },
      { ...base, id: "p-ai-2", status: "NEW", value: null, attributedDecisionId: "dec-2" },
      { ...base, id: "p-manual-1", status: "CONVERTED", value: 500, attributedDecisionId: null },
      { ...base, id: "p-manual-2", status: "NEW", value: null, attributedDecisionId: null },
    ];
    state.decisions = [{ id: "dec-1", actionType: "CSO_LAUNCH_LINKEDIN" }];

    const report = await getCsoROIDashboard(WORKSPACE_ID);

    expect(report.totalProspects).toBe(4);
    expect(report.totalConverted).toBe(2);
    expect(report.totalPipelineValue).toBe(1500);
    expect(report.conversionRate).toBe(50);
    expect(report.avgDealValue).toBe(750);

    expect(report.attributionByOrigin.AI_AGENT).toEqual({
      count: 2, converted: 1, conversionRate: 50, totalValue: 1000, avgDealValue: 1000,
    });
    expect(report.attributionByOrigin.MANUAL).toEqual({
      count: 2, converted: 1, conversionRate: 50, totalValue: 500, avgDealValue: 500,
    });

    expect(report.pipelineByActionType).toEqual([
      { actionType: "CSO_LAUNCH_LINKEDIN", count: 1, pipeline: 1000, avgDealValue: 1000 },
    ]);
  });

  it("exclut proprement un prospect dont la décision attribuée a été supprimée", async () => {
    state.prospects = [
      { ...base, id: "p-orphan", status: "CONVERTED", value: 2000, attributedDecisionId: "dec-deleted" },
    ];
    state.decisions = []; // la décision n'existe plus

    const report = await getCsoROIDashboard(WORKSPACE_ID);

    // Le prospect compte toujours dans le pipeline global et le bucket AI_AGENT...
    expect(report.totalPipelineValue).toBe(2000);
    expect(report.attributionByOrigin.AI_AGENT.totalValue).toBe(2000);
    // ...mais ne peut pas être ventilé par type d'action puisque la décision a disparu.
    expect(report.pipelineByActionType).toEqual([]);
  });

  it("place un prospect exactement à la frontière des 12 semaines", async () => {
    const eightyFourDaysAgo = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000);
    const eightyFiveDaysAgo = new Date(Date.now() - 85 * 24 * 60 * 60 * 1000);
    state.prospects = [
      { ...base, id: "p-in", createdAt: eightyFourDaysAgo },
      { ...base, id: "p-out", createdAt: eightyFiveDaysAgo },
    ];

    const report = await getCsoROIDashboard(WORKSPACE_ID);
    const totalLeadsInWeeklyPipeline = report.weeklyPipeline.reduce((s, w) => s + w.leads, 0);
    expect(totalLeadsInWeeklyPipeline).toBe(1);
  });
});
