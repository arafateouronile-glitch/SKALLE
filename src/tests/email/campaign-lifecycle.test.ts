import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeStep {
  status: string;
}

const { state } = vi.hoisted(() => ({
  state: {
    steps: [] as FakeStep[],
    campaignUpdates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
    sequenceUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sequenceStep: {
      findMany: vi.fn(() => state.steps),
    },
    emailCampaign: {
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        state.campaignUpdates.push(args);
        return args;
      }),
    },
    outreachSequence: {
      updateMany: vi.fn((args: { where: unknown; data: Record<string, unknown> }) => {
        state.sequenceUpdates.push(args);
        return args;
      }),
    },
  },
}));

import { checkAndApplyBounceGuard } from "@/lib/email/campaign-lifecycle";

const CAMPAIGN_ID = "camp-1";

function setSteps(statuses: string[]) {
  state.steps = statuses.map((status) => ({ status }));
}

beforeEach(() => {
  state.steps = [];
  state.campaignUpdates = [];
  state.sequenceUpdates = [];
});

describe("checkAndApplyBounceGuard", () => {
  it("ne met jamais en pause sous l'échantillon minimum (10), même à 100% d'échec", async () => {
    setSteps(["FAILED", "FAILED", "FAILED", "SENT"]); // 4 tentatives, 75% d'échec

    const result = await checkAndApplyBounceGuard(CAMPAIGN_ID);

    expect(result.paused).toBe(false);
    expect(state.campaignUpdates).toHaveLength(0);
  });

  it("ne met pas en pause sous le seuil de 15% avec un échantillon suffisant", async () => {
    setSteps([...Array(18).fill("SENT"), ...Array(2).fill("FAILED")]); // 20 tentatives, 10%

    const result = await checkAndApplyBounceGuard(CAMPAIGN_ID);

    expect(result.paused).toBe(false);
    expect(result.failureRate).toBeCloseTo(0.1);
    expect(state.campaignUpdates).toHaveLength(0);
  });

  it("met en pause au-dessus du seuil de 15% avec un échantillon suffisant", async () => {
    setSteps([...Array(16).fill("SENT"), ...Array(4).fill("FAILED")]); // 20 tentatives, 20%

    const result = await checkAndApplyBounceGuard(CAMPAIGN_ID);

    expect(result.paused).toBe(true);
    expect(result.failureRate).toBeCloseTo(0.2);
    expect(state.campaignUpdates).toHaveLength(1);
    expect(state.campaignUpdates[0].data.status).toBe("PAUSED");
    expect(state.campaignUpdates[0].data.pausedReason).toContain("20%");
    expect(state.sequenceUpdates).toHaveLength(1);
    expect(state.sequenceUpdates[0].data.isActive).toBe(false);
  });

  it("ignore les steps PENDING/SKIPPED dans le calcul du taux d'échec", async () => {
    // 20 PENDING (jamais tentés) + 5 SENT + 5 FAILED → 50% sur les 10 réellement tentés
    setSteps([
      ...Array(20).fill("PENDING"),
      ...Array(5).fill("SENT"),
      ...Array(5).fill("FAILED"),
    ]);

    const result = await checkAndApplyBounceGuard(CAMPAIGN_ID);

    expect(result.totalAttempted).toBe(10);
    expect(result.paused).toBe(true);
  });
});
