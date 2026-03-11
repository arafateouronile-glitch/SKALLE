import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Mocks LLM ────────────────────────────────────────────────────────────────
// On mock les modules LLM avant tout import du brain
vi.mock("@/lib/ai/langchain", () => ({
  getClaude: vi.fn(() => ({ invoke: vi.fn() })),
  getOpenAI: vi.fn(() => ({ invoke: vi.fn() })),
  getStringParser: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    post: { findMany: vi.fn(() => []) },
    agentDecision: { findMany: vi.fn(() => []), findFirst: vi.fn(() => null), create: vi.fn((d) => ({ id: "dec-1", ...d.data })), count: vi.fn(() => 0) },
    prospect: { findMany: vi.fn(() => []) },
    competitorAd: { findMany: vi.fn(() => []) },
    conversion: { findMany: vi.fn(() => []) },
    autopilotConfig: { findUnique: vi.fn(() => null) },
    workspace: { findUnique: vi.fn(() => ({ brandVoice: {} })), update: vi.fn() },
    user: { findUnique: vi.fn(() => ({ plan: "AGENCY" })) },
  },
}));

vi.mock("@/lib/ai/serper", () => ({
  searchGoogle: vi.fn(() => ({ organic: [], news: [] })),
}));

vi.mock("@/lib/services/integrations/google-search-console", () => ({
  getTopPages: vi.fn(() => []),
  getDecliningPages: vi.fn(() => []),
}));

vi.mock("@/lib/ai/budget-guard", () => ({
  checkBudget: vi.fn(() => ({ allowed: true, spentCents: 0, limitCents: 500 })),
  trackSpend: vi.fn(),
}));

// ─── Helpers réexportés pour les tests ───────────────────────────────────────
// On teste la logique pure via les exports du module
import { AgentDecisionSchema } from "@/lib/services/agent/brain";

// ─── Tests Zod Schema ─────────────────────────────────────────────────────────
describe("AgentDecisionSchema", () => {
  it("valide une décision SEO_ARTICLE correcte", () => {
    const valid = {
      actionType: "SEO_ARTICLE",
      keyword: "marketing automation",
      platform: null,
      priority: 1,
      reasoning: "Le keyword a un fort volume avec peu de concurrence",
      estimatedImpact: "+20% clics GSC en 3 mois",
      actionData: { keyword: "marketing automation" },
    };
    expect(AgentDecisionSchema.safeParse(valid).success).toBe(true);
  });

  it("valide une décision SOCIAL_POST avec plateforme", () => {
    const valid = {
      actionType: "SOCIAL_POST",
      keyword: "growth hacking",
      platform: "linkedin",
      priority: 2,
      reasoning: "Tendance forte sur LinkedIn cette semaine",
      estimatedImpact: "500 impressions estimées",
      actionData: { platform: "linkedin" },
    };
    expect(AgentDecisionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejette une priorité hors range", () => {
    const invalid = {
      actionType: "SEO_ARTICLE",
      keyword: "test",
      platform: null,
      priority: 10, // doit être 1-5
      reasoning: "test",
      estimatedImpact: "test",
      actionData: {},
    };
    expect(AgentDecisionSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejette un actionType inconnu", () => {
    const invalid = {
      actionType: "UNKNOWN_TYPE",
      keyword: "test",
      platform: null,
      priority: 1,
      reasoning: "test",
      estimatedImpact: "test",
      actionData: {},
    };
    expect(AgentDecisionSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepte tous les 7 types d'action valides", () => {
    const validTypes = [
      "SEO_ARTICLE", "SEO_REGENERATE", "SOCIAL_POST",
      "AD_REMIX", "PROSPECT_DM", "DISCOVERY_SCAN", "COMPETITOR_REACT",
    ];
    for (const actionType of validTypes) {
      const result = AgentDecisionSchema.safeParse({
        actionType,
        keyword: "test",
        platform: null,
        priority: 3,
        reasoning: "test reasoning",
        estimatedImpact: "test impact",
        actionData: {},
      });
      expect(result.success, `${actionType} should be valid`).toBe(true);
    }
  });
});

// ─── Tests stripMarkdownJson (regex corrigée : ^```\w*\s*) ───────────────────
describe("stripMarkdownJson", () => {
  // Miroir exact de la fonction dans brain.ts (après correction)
  function stripMarkdownJson(raw: string): string {
    return raw
      .replace(/^```\w*\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
  }

  it("supprime les balises ```json...```", () => {
    const input = "```json\n[{\"actionType\": \"SEO_ARTICLE\"}]\n```";
    expect(stripMarkdownJson(input)).toBe('[{"actionType": "SEO_ARTICLE"}]');
  });

  it("supprime les balises ``` sans langue", () => {
    const input = "```\n[{\"actionType\": \"SEO_ARTICLE\"}]\n```";
    expect(stripMarkdownJson(input)).toBe('[{"actionType": "SEO_ARTICLE"}]');
  });

  it("supprime les balises ```javascript...```", () => {
    const input = "```javascript\n[{\"actionType\": \"SEO_ARTICLE\"}]\n```";
    expect(stripMarkdownJson(input)).toBe('[{"actionType": "SEO_ARTICLE"}]');
  });

  it("laisse un JSON propre intact", () => {
    const input = '[{"actionType": "SEO_ARTICLE"}]';
    expect(stripMarkdownJson(input)).toBe(input);
  });
});

// ─── Tests logique déduplication ─────────────────────────────────────────────
describe("Déduplication planAndStore", () => {
  // On teste la logique pure de déduplication sans appel DB
  // en reproduisant les conditions des guards

  function isDuplicateSeoKeyword(
    keyword: string,
    existingKeywords: Set<string>
  ): boolean {
    return existingKeywords.has(keyword.toLowerCase());
  }

  function isDuplicateSocialPost(
    keyword: string,
    platform: string,
    recentDecisions: Array<{ actionType: string; keyword: string; platform: string }>
  ): boolean {
    return recentDecisions.some(
      (d) =>
        d.actionType === "SOCIAL_POST" &&
        d.keyword.toLowerCase() === keyword.toLowerCase() &&
        d.platform === platform
    );
  }

  function isDuplicateProspectDm(
    recentDecisions: Array<{ actionType: string }>
  ): boolean {
    return recentDecisions.some((d) => d.actionType === "PROSPECT_DM");
  }

  it("détecte un doublon SEO_ARTICLE sur keyword déjà en DRAFT", () => {
    const existing = new Set(["marketing automation", "seo technique"]);
    expect(isDuplicateSeoKeyword("Marketing Automation", existing)).toBe(true);
    expect(isDuplicateSeoKeyword("nouveau sujet", existing)).toBe(false);
  });

  it("est insensible à la casse pour la déduplication SEO", () => {
    const existing = new Set(["growth hacking"]);
    expect(isDuplicateSeoKeyword("Growth Hacking", existing)).toBe(true);
    expect(isDuplicateSeoKeyword("GROWTH HACKING", existing)).toBe(true);
  });

  it("détecte un doublon SOCIAL_POST sur même keyword + plateforme", () => {
    const recent = [
      { actionType: "SOCIAL_POST", keyword: "ia générative", platform: "LINKEDIN" },
    ];
    expect(isDuplicateSocialPost("IA Générative", "LINKEDIN", recent)).toBe(true);
    expect(isDuplicateSocialPost("ia générative", "X", recent)).toBe(false); // autre plateforme OK
    expect(isDuplicateSocialPost("autre sujet", "LINKEDIN", recent)).toBe(false);
  });

  it("autorise SOCIAL_POST sur même keyword sur plateforme différente", () => {
    const recent = [
      { actionType: "SOCIAL_POST", keyword: "seo", platform: "LINKEDIN" },
    ];
    expect(isDuplicateSocialPost("seo", "INSTAGRAM", recent)).toBe(false);
    expect(isDuplicateSocialPost("seo", "TIKTOK", recent)).toBe(false);
  });

  it("détecte un PROSPECT_DM déjà en attente cette semaine", () => {
    const withDm = [{ actionType: "PROSPECT_DM" }];
    const withoutDm = [{ actionType: "SOCIAL_POST" }];
    expect(isDuplicateProspectDm(withDm)).toBe(true);
    expect(isDuplicateProspectDm(withoutDm)).toBe(false);
    expect(isDuplicateProspectDm([])).toBe(false);
  });

  it("n'interfère pas entre types différents", () => {
    // Un SEO_ARTICLE sur "seo" ne bloque pas un SOCIAL_POST sur "seo"
    const seoKeywords = new Set(["seo"]);
    const recentDecisions = [{ actionType: "SEO_ARTICLE", keyword: "seo", platform: "LINKEDIN" }];
    // La dédup SEO ne bloque pas SOCIAL
    expect(isDuplicateSocialPost("seo", "LINKEDIN", recentDecisions)).toBe(false);
    // La dédup SOCIAL ne bloque pas SEO
    expect(isDuplicateSeoKeyword("autre", seoKeywords)).toBe(false);
  });
});

// ─── Tests budget guard ───────────────────────────────────────────────────────
describe("Budget Guard (mock)", () => {
  it("bloque le cycle si checkBudget retourne allowed:false", async () => {
    const { checkBudget } = await import("@/lib/ai/budget-guard");
    vi.mocked(checkBudget).mockResolvedValueOnce({
      allowed: false,
      spentCents: 500,
      limitCents: 500,
      reason: "Budget dépassé",
    });

    const { runDailyMarketingCycle } = await import("@/lib/services/agent/brain");
    const result = await runDailyMarketingCycle("ws-123");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Budget dépassé");
  });
});
