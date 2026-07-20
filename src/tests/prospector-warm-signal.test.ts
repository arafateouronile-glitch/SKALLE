import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks des dépendances lourdes — tagWarmSignal n'utilise que prisma ───────
vi.mock("@/lib/ai/langchain", () => ({
  getClaude: vi.fn(() => ({ invoke: vi.fn() })),
  getStringParser: vi.fn(() => ({ invoke: vi.fn() })),
}));
vi.mock("@/lib/services/meta/graph-api", () => ({ metaGet: vi.fn() }));
vi.mock("@/lib/services/meta/token-manager", () => ({ refreshTokenIfNeeded: vi.fn() }));
vi.mock("@/lib/services/social/closer", () => ({ generateOpeningMessageVariants: vi.fn() }));
vi.mock("@/lib/services/integrations/external", () => ({ getExternalIntegrationKey: vi.fn() }));
vi.mock("@/lib/services/smart-sequence-processor", () => ({
  FAR_FUTURE: new Date("2099-01-01T00:00:00.000Z"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prospect: {
      update: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
  },
}));

import { tagWarmSignal, warmSignalLabel } from "@/lib/services/social/prospector";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tagWarmSignal", () => {
  it("pose warmSignalType/At et temperature WARM", async () => {
    await tagWarmSignal("p-1", "SEO_CONVERSION", 80);

    expect(prisma.prospect.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: expect.objectContaining({ warmSignalType: "SEO_CONVERSION", temperature: "WARM" }),
    });
  });

  it("ne relève le score que via une condition 'lt' — ne le fait jamais régresser", async () => {
    await tagWarmSignal("p-1", "SEO_CONVERSION", 80);

    expect(prisma.prospect.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", score: { lt: 80 } },
      data: { score: 80 },
    });
  });
});

describe("warmSignalLabel", () => {
  it("décrit une conversion marketing entrante", () => {
    expect(warmSignalLabel("SEO_CONVERSION")).toBe("a converti depuis un contenu marketing");
  });

  it("retombe sur un libellé générique pour un type inconnu", () => {
    expect(warmSignalLabel("SOMETHING_ELSE")).toBe("signal entrant");
    expect(warmSignalLabel(null)).toBe("signal entrant");
  });
});
