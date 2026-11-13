import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Régression pour la panne fonctionnelle découverte lors de l'audit Goskalle :
 * approuver une décision CSO_LAUNCH_EMAIL/CSO_FOLLOWUP/CSO_STALE_REJECT ne
 * déclenchait rien (l'extension Chrome n'a aucune logique pour ces types et
 * les faisait retomber en FAILED, ou CSO_STALE_REJECT restait bloqué en
 * APPROVED pour toujours). PATCH /api/cso-agent doit désormais exécuter ces
 * types directement, en laissant CSO_LAUNCH_LINKEDIN suivre son chemin
 * existant (extension via /api/cso-agent/queue + /executed).
 */

function mockDecision(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "dec-1",
    workspaceId: "ws-1",
    actionType: "CSO_LAUNCH_EMAIL",
    status: "PENDING",
    priority: 2,
    reasoning: "test",
    actionData: {},
    result: null,
    createdAt: new Date("2026-07-01"),
    updatedAt: new Date("2026-07-01"),
    executedAt: null,
    ...overrides,
  };
}

const { authMock, workspaceFindFirst, agentDecisionFindFirst, agentDecisionUpdate, executeCsoDecisionMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  workspaceFindFirst: vi.fn(),
  agentDecisionFindFirst: vi.fn(),
  agentDecisionUpdate: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: args.where.id,
    ...args.data,
  })),
  executeCsoDecisionMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findFirst: workspaceFindFirst },
    agentDecision: {
      findFirst: agentDecisionFindFirst,
      update: agentDecisionUpdate,
      findMany: vi.fn(() => Promise.resolve([])),
    },
    prospect: { count: vi.fn(() => Promise.resolve(0)) },
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/services/sales/cso-agent", () => ({
  executeCsoDecision: executeCsoDecisionMock,
}));

import type { NextRequest } from "next/server";
import { PATCH } from "@/app/api/cso-agent/route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/cso-agent", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user-1", email: "test@test.com" } });
  workspaceFindFirst.mockResolvedValue({ id: "ws-1" });
  agentDecisionFindFirst.mockResolvedValue(mockDecision());
});

describe("PATCH /api/cso-agent — approve", () => {
  it("exécute directement une décision CSO_LAUNCH_EMAIL approuvée (pas de dépendance à l'extension)", async () => {
    agentDecisionFindFirst.mockResolvedValue(mockDecision({ actionType: "CSO_LAUNCH_EMAIL" }));
    executeCsoDecisionMock.mockResolvedValue({ ok: true, message: "Exécuté avec succès" });

    const res = await PATCH(makeReq({ decisionId: "dec-1", workspaceId: "ws-1", action: "approve" }));
    const json = await res.json();

    expect(executeCsoDecisionMock).toHaveBeenCalledWith("dec-1", "ws-1");
    expect(json.status).toBe("EXECUTED");
    expect(json.ok).toBe(true);
  });

  it("exécute directement une décision CSO_STALE_REJECT approuvée", async () => {
    agentDecisionFindFirst.mockResolvedValue(mockDecision({ actionType: "CSO_STALE_REJECT" }));
    executeCsoDecisionMock.mockResolvedValue({ ok: true, message: "Exécuté avec succès" });

    const res = await PATCH(makeReq({ decisionId: "dec-1", workspaceId: "ws-1", action: "approve" }));
    const json = await res.json();

    expect(executeCsoDecisionMock).toHaveBeenCalledWith("dec-1", "ws-1");
    expect(json.status).toBe("EXECUTED");
  });

  it("renvoie FAILED sans planter si executeCsoDecision échoue", async () => {
    agentDecisionFindFirst.mockResolvedValue(mockDecision({ actionType: "CSO_FOLLOWUP" }));
    executeCsoDecisionMock.mockResolvedValue({ ok: false, message: "Erreur: pas de séquence active" });

    const res = await PATCH(makeReq({ decisionId: "dec-1", workspaceId: "ws-1", action: "approve" }));
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.status).toBe("FAILED");
  });

  it("ne branche PAS executeCsoDecision pour CSO_LAUNCH_LINKEDIN — reste APPROVED pour l'extension", async () => {
    agentDecisionFindFirst.mockResolvedValue(mockDecision({ actionType: "CSO_LAUNCH_LINKEDIN" }));

    const res = await PATCH(makeReq({ decisionId: "dec-1", workspaceId: "ws-1", action: "approve" }));
    const json = await res.json();

    expect(executeCsoDecisionMock).not.toHaveBeenCalled();
    expect(json.status).toBe("APPROVED");
  });
});
