/**
 * CSO Agent Brain — Pipeline Manager (Semi-Auto)
 *
 * observe → generate → store
 * Execution is triggered separately after user approval.
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { SequenceChannel } from "@prisma/client";
import { checkBudget, trackSpend } from "@/lib/ai/budget-guard";
import { researchProspectsBatch, type ProspectInput } from "@/lib/prospection/prospect-researcher";
import { warmSignalLabel } from "@/lib/services/social/prospector";
import { generateCsoMessages, buildBrandContext } from "@/lib/prospection/message-generator";
import { FAR_FUTURE } from "@/lib/services/smart-sequence-processor";
import { getApolloApiKey, apolloEnrichPerson } from "@/lib/services/apollo-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CsoActionType =
  | "CSO_LAUNCH_LINKEDIN"
  | "CSO_LAUNCH_EMAIL"
  | "CSO_FOLLOWUP"
  | "CSO_STALE_REJECT";

export interface CsoDecisionDraft {
  actionType: CsoActionType;
  prospectId: string;
  prospectName: string;
  reasoning: string;
  priority: number; // 1 (urgent) → 5 (low)
  actionData: Record<string, unknown>;
}

export interface PipelineObservation {
  highScoreNew: Array<{
    id: string; name: string; company: string; jobTitle: string | null;
    email: string | null; linkedInUrl: string | null; score: number;
    hasEmail: boolean; hasLinkedIn: boolean;
    enrichmentData: Record<string, unknown> | null;
    warmSignalType: string | null; warmSignalAt: Date | null;
  }>;
  stagnantContacted: Array<{
    id: string; name: string; company: string; jobTitle: string | null;
    daysSinceContact: number; channel: string;
    lastMessage: string | null;
  }>;
  staleProspects: Array<{
    id: string; name: string; company: string;
    daysSinceContact: number;
  }>;
}

// ─── Step 0: Auto-enrich avec Apollo ─────────────────────────────────────────

/**
 * Enrichit silencieusement les prospects sans email via Apollo avant l'analyse CSO.
 * Retourne le nombre de prospects enrichis.
 */
export async function autoEnrichWithApollo(
  workspaceId: string,
  limit = 10
): Promise<number> {
  const apiKey = await getApolloApiKey(workspaceId);
  if (!apiKey) return 0;

  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      status: { in: ["NEW", "RESEARCHED", "MESSAGES_GENERATED"] },
      OR: [{ email: null }, { email: { endsWith: "@discovery.skalle" } }],
    },
    select: { id: true, name: true, company: true, linkedInUrl: true },
    orderBy: { score: "desc" },
    take: limit,
  });

  if (!prospects.length) return 0;

  let enriched = 0;
  for (const p of prospects) {
    const parts = p.name.trim().split(/\s+/);
    const result = await apolloEnrichPerson(apiKey, {
      linkedInUrl: p.linkedInUrl || undefined,
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      company: p.company,
    });

    if (result?.email) {
      await prisma.prospect.update({
        where: { id: p.id },
        data: {
          email: result.email,
          emailVerified: result.emailStatus === "verified",
          emailStatus: result.emailStatus ?? undefined,
        },
      });
      enriched++;
    }
    // Respecter le rate limit Apollo
    await new Promise((r) => setTimeout(r, 200));
  }

  return enriched;
}

// ─── Step 1: Observe ──────────────────────────────────────────────────────────

export async function observePipeline(workspaceId: string): Promise<PipelineObservation> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000);

  // Load active persona IDs to restrict prospects to ICP-matching ones only
  const activePersonas = await prisma.persona.findMany({
    where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
    select: { id: true },
  });
  // Un signal chaud récent (vue de profil, engagement, follow) prime sur le
  // ciblage ICP : l'intérêt entrant ne doit jamais être masqué par un persona
  // actif, contrairement au reste de la prospection froide.
  const personaFilter =
    activePersonas.length > 0
      ? {
          OR: [
            { personaId: { in: activePersonas.map((p) => p.id) } },
            { warmSignalAt: { gte: fourteenDaysAgo } },
          ],
        }
      : {};

  // Prospects non contactés — pas de filtre score (Claude priorise lui-même)
  const newProspects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      ...personaFilter,
      status: { in: ["NEW", "RESEARCHED", "MESSAGES_GENERATED"] },
    },
    select: {
      id: true, name: true, company: true, jobTitle: true,
      email: true, linkedInUrl: true, score: true, enrichmentData: true,
      warmSignalType: true, warmSignalAt: true,
    },
    orderBy: { score: "desc" },
    take: 20,
  });

  // Filter out prospects that already have messages actually sent (not just planned)
  const inQueue = await prisma.sequenceStep.findMany({
    where: {
      status: { in: ["SENT", "DELIVERED", "OPENED"] },
      sequence: { workspaceId },
    },
    select: { sequence: { select: { prospectId: true } } },
  });
  const queuedIds = new Set(inQueue.map((s) => s.sequence.prospectId));

  const highScoreNew = newProspects
    .filter((p) => !queuedIds.has(p.id))
    .map((p) => ({
      ...p,
      hasEmail: !!p.email,
      hasLinkedIn: !!p.linkedInUrl,
      enrichmentData: (p.enrichmentData ?? null) as Record<string, unknown> | null,
    }))
    .slice(0, 10);

  // CONTACTED with no reply for 5+ days (or never had interaction recorded)
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1_000);
  const contactedProspects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      ...personaFilter,
      status: "CONTACTED",
      OR: [
        { lastInteractionAt: { lte: fiveDaysAgo } },
        { lastInteractionAt: null },
      ],
    },
    select: {
      id: true, name: true, company: true, jobTitle: true,
      lastInteractionAt: true,
      sequences: {
        where: { isActive: true },
        select: {
          steps: {
            where: { status: { in: ["SENT", "DELIVERED"] } },
            select: { content: true, channel: true, sentAt: true },
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
        take: 1,
      },
    },
    orderBy: { lastInteractionAt: "asc" },
    take: 15,
  });

  const stagnantContacted = contactedProspects.map((p) => {
    const daysSince = p.lastInteractionAt
      ? Math.floor((now.getTime() - p.lastInteractionAt.getTime()) / 86_400_000)
      : 99;
    const lastStep = p.sequences[0]?.steps[0];
    return {
      id: p.id,
      name: p.name,
      company: p.company,
      jobTitle: p.jobTitle,
      daysSinceContact: daysSince,
      channel: (lastStep?.channel ?? "EMAIL") as string,
      lastMessage: lastStep?.content?.slice(0, 200) ?? null,
    };
  });

  // CONTACTED 21+ days → candidates for REJECTED
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1_000);
  const staleRaw = await prisma.prospect.findMany({
    where: {
      workspaceId,
      ...personaFilter,
      status: "CONTACTED",
      OR: [
        { lastInteractionAt: { lte: twentyOneDaysAgo } },
        { lastInteractionAt: null },
      ],
    },
    select: { id: true, name: true, company: true, lastInteractionAt: true },
    orderBy: { lastInteractionAt: "asc" },
    take: 10,
  });

  const staleProspects = staleRaw.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    daysSinceContact: p.lastInteractionAt
      ? Math.floor((now.getTime() - p.lastInteractionAt.getTime()) / 86_400_000)
      : 99,
  }));

  return { highScoreNew, stagnantContacted, staleProspects };
}

// ─── Step 2: Generate decisions with Claude ───────────────────────────────────

function stripMarkdownJson(raw: string): string {
  return raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
}

function buildIcpSection(personas: Array<{ name: string; raw: unknown }>): string {
  if (!personas.length) return "";

  const lines = personas.map((persona) => {
    const r = (persona.raw ?? {}) as Record<string, unknown>;
    const parts: string[] = [`### Persona : ${persona.name}`];
    if (r.industry) parts.push(`- Secteur : ${r.industry}`);
    if (Array.isArray(r.jobTitles) && r.jobTitles.length)
      parts.push(`- Titres de poste ciblés : ${r.jobTitles.join(", ")}`);
    if (Array.isArray(r.companySizes) && r.companySizes.length)
      parts.push(`- Taille d'entreprise : ${r.companySizes.join(", ")}`);
    if (Array.isArray(r.locations) && r.locations.length)
      parts.push(`- Géographies : ${r.locations.join(", ")}`);
    if (Array.isArray(r.keywords) && r.keywords.length)
      parts.push(`- Mots-clés ICP : ${r.keywords.join(", ")}`);
    if (Array.isArray(r.painPoints) && r.painPoints.length)
      parts.push(`- Points de douleur : ${r.painPoints.join(", ")}`);
    return parts.join("\n");
  });

  return `\n## Profil client idéal (ICP) — critères de priorisation\nPriorise les prospects qui correspondent aux personas ci-dessous. Justifie toujours l'adéquation ICP dans le reasoning.\n${lines.join("\n\n")}\n`;
}

function buildSystemPrompt(brandContext: string, icpSection = ""): string {
  const brandSection = brandContext
    ? `\n## Contexte de marque (à utiliser dans tous les messages générés)\n${brandContext}\n`
    : "";
  return `Tu es le CSO Agent, un assistant autonome de gestion de pipeline commercial.

Ton rôle : analyser l'état du pipeline et générer des décisions d'outreach personnalisées et priorisées.
${brandSection}${icpSection}
Pour chaque prospect, tu génères une décision structurée :
- actionType : CSO_LAUNCH_LINKEDIN | CSO_LAUNCH_EMAIL | CSO_FOLLOWUP | CSO_STALE_REJECT
- Règles :
  • CSO_LAUNCH_LINKEDIN : prospect NEW/RESEARCHED avec linkedInUrl, score ≥ 70 OU signal 🎯 entrant (l'intérêt entrant justifie l'action même à score plus bas)
  • CSO_LAUNCH_EMAIL : prospect NEW/RESEARCHED avec email, score ≥ 50 (et pas de LinkedIn ou score < 70)
  • CSO_FOLLOWUP : prospect CONTACTED depuis 5-20 jours sans réponse → message de relance
  • CSO_STALE_REJECT : prospect CONTACTED depuis 21+ jours → suggérer de marquer REJECTED (libère le pipeline)
- priority : 1 (urgent, score élevé ou délai long) → 5 (peu urgent)
- Pour LAUNCH_LINKEDIN : génère une note de connexion (<300 chars) personnalisée au contexte de marque
- Pour LAUNCH_EMAIL : génère un objet + corps d'email (~120 mots) personnalisé au ton de marque
- Pour FOLLOWUP : génère un message court de relance (60-80 mots) sur le même canal que le dernier contact
- Pour STALE_REJECT : reasoning explicatif uniquement, pas de message

Réponds UNIQUEMENT avec un JSON valide, tableau de décisions :
[
  {
    "actionType": "CSO_LAUNCH_LINKEDIN",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 1,
    "actionData": {
      "connectNote": "...",
      "linkedInUrl": "..."
    }
  },
  {
    "actionType": "CSO_LAUNCH_EMAIL",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 2,
    "actionData": {
      "subject": "...",
      "content": "...",
      "email": "..."
    }
  },
  {
    "actionType": "CSO_FOLLOWUP",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 2,
    "actionData": {
      "channel": "EMAIL",
      "subject": "...",
      "content": "..."
    }
  },
  {
    "actionType": "CSO_STALE_REJECT",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 4,
    "actionData": {}
  }
]

Génère au maximum 15 décisions au total. Priorise la qualité sur la quantité.`
}

export type CsoProgressEvent =
  | { step: "research_start"; meta: { count: number } }
  | { step: "research_done";  meta: { count: number } }
  | { step: "generate_start" }
  | { step: "generate_done";  meta: { count: number } }
  | { step: "personalize_start"; meta: { count: number } }
  | { step: "personalize_done" };

export async function generateCsoDecisions(
  obs: PipelineObservation,
  workspaceId: string,
  onProgress?: (evt: CsoProgressEvent) => void
): Promise<CsoDecisionDraft[]> {
  const total =
    obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;
  if (total === 0) return [];

  const [workspace, personas] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        brandVoice: true,
        signature: true,
        user: { select: { plan: true } },
      },
    }),
    prisma.persona.findMany({
      where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
      select: { name: true, raw: true },
      take: 3,
    }),
  ]);

  const plan = workspace?.user?.plan ?? "AGENCY";
  const budgetCheck = await checkBudget(workspaceId, "cso_agent_analyze", "claude-sonnet-4-6", plan);
  if (!budgetCheck.allowed) {
    console.warn(`[CSO Agent] Budget dépassé pour ${workspaceId}: ${budgetCheck.reason}`);
    return [];
  }

  const bv = (workspace?.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(workspace?.name ?? "Skalle", bv);

  // ── Step A: Research high-score prospects in parallel ──────────────────────
  const prospectInputs: ProspectInput[] = obs.highScoreNew.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    jobTitle: p.jobTitle,
    linkedInUrl: p.linkedInUrl,
    email: p.email,
    enrichmentData: p.enrichmentData,
  }));

  onProgress?.({ step: "research_start", meta: { count: prospectInputs.length } });
  const researchMap = prospectInputs.length > 0
    ? await researchProspectsBatch(prospectInputs, 2).catch(() => new Map())
    : new Map();
  onProgress?.({ step: "research_done", meta: { count: researchMap.size } });

  // ── Step B: Claude decides WHICH prospects to contact + priority ───────────
  const brandContext = [
    workspace?.name ? `Entreprise : ${workspace.name}` : null,
    brand.offer ? `Offre : ${brand.offer}` : null,
    brand.tone ? `Ton : ${brand.tone}` : null,
  ].filter(Boolean).join("\n");

  // Enrich highScoreNew with research signals for better decision making
  const newProspectsWithContext = obs.highScoreNew.map((p) => {
    const r = researchMap.get(p.id);
    const signalParts = [
      p.warmSignalAt
        ? `🎯 Signal entrant : ${warmSignalLabel(p.warmSignalType)} il y a ${Math.floor((Date.now() - p.warmSignalAt.getTime()) / 86_400_000)}j`
        : null,
      r?.companyTrigger ? `🔥 ${r.companyTrigger}` : null,
      r?.hiringSignals[0] ? `💼 ${r.hiringSignals[0]}` : null,
      r?.recentJobChange ? "🆕 Changement de poste récent" : null,
      r ? `Confiance research: ${r.confidence}` : null,
    ].filter(Boolean);
    const signals = signalParts.length ? signalParts.join(" | ") : "Pas de signal fort détecté";
    const liUrl = p.linkedInUrl ? `linkedInUrl: ${p.linkedInUrl}` : "LinkedIn: ✗";
    return `- ${p.name} | ${p.company} | ${p.jobTitle ?? "N/A"} | Score: ${p.score} | Email: ${p.hasEmail ? "✓" : "✗"} | ${liUrl} | SIGNALS: [${signals}] | id: ${p.id}`;
  });

  const humanPrompt = `
Voici l'état actuel du pipeline :

## Prospects high-score non contactés (${obs.highScoreNew.length})
${newProspectsWithContext.join("\n")}

## Prospects contactés sans réponse (${obs.stagnantContacted.length})
${obs.stagnantContacted.map((p) =>
    `- ${p.name} | ${p.company} | ${p.daysSinceContact}j sans réponse | Canal: ${p.channel} | Dernier message: "${p.lastMessage ?? "N/A"}" | id: ${p.id}`
  ).join("\n")}

## Prospects en attente depuis 21+ jours (${obs.staleProspects.length})
${obs.staleProspects.map((p) =>
    `- ${p.name} | ${p.company} | ${p.daysSinceContact}j sans activité | id: ${p.id}`
  ).join("\n")}

Priorise en premier les prospects avec un 🎯 signal entrant (ils ont initié le contact — vue de profil, engagement, follow) : c'est un signal d'achat plus fort qu'un déclencheur externe. Priorise ensuite les SIGNALS firmographiques (🔥 levée, 💼 recrutement, 🆕 changement de poste).
Génère les décisions. Les messages seront personnalisés séparément.
`;

  onProgress?.({ step: "generate_start" });

  const claude = getClaude();
  const parser = getStringParser();

  const icpSection = buildIcpSection(personas);

  const response = await claude.invoke([
    new SystemMessage({ content: buildSystemPrompt(brandContext, icpSection) }),
    new HumanMessage({ content: humanPrompt }),
  ]);

  await trackSpend(workspaceId, "cso_agent_analyze").catch(() => undefined);

  const raw = await parser.invoke(response);
  const clean = stripMarkdownJson(raw);

  let decisions: CsoDecisionDraft[] = [];
  try {
    const parsed = JSON.parse(clean) as CsoDecisionDraft[];
    decisions = Array.isArray(parsed) ? parsed.slice(0, 15) : [];
  } catch {
    return [];
  }

  onProgress?.({ step: "generate_done", meta: { count: decisions.length } });

  // ── Step C: Generate hyper-personalized messages for ALL decisions ──────────
  onProgress?.({ step: "personalize_start", meta: { count: decisions.length } });

  const enrichedDecisions = await Promise.all(
    decisions.map(async (d): Promise<CsoDecisionDraft> => {
      if (d.actionType === "CSO_STALE_REJECT") return d;

      const prospectData = obs.highScoreNew.find((p) => p.id === d.prospectId)
        ?? obs.stagnantContacted.find((p) => p.id === d.prospectId);
      if (!prospectData) return d;

      const rawEnrichment = "enrichmentData" in prospectData ? prospectData.enrichmentData : null;
      const liEnrich = ((rawEnrichment as Record<string, unknown> | null)?.linkedIn ?? null) as {
        headline?: string | null;
        about?: string | null;
        experiences?: Array<{ title: string; company: string; description: string | null }>;
      } | null;

      const research = researchMap.get(d.prospectId) ?? {
        companyTrigger: null,
        hiringSignals: [],
        recentNews: [],
        techStack: [],
        recentLinkedInActivity: null,
        recentJobChange: false,
        linkedInHeadline: liEnrich?.headline ?? prospectData.jobTitle ?? null,
        linkedInAbout: liEnrich?.about ?? null,
        linkedInExperiences: liEnrich?.experiences ?? [],
        companyStage: "PME établie",
        topPainPoint: "gestion administrative chronophage",
        suggestedAngle: "productivité" as const,
        urgencySignal: "N/A",
        icebreakerLine: "",
        jobTenure: null,
        confidence: "low" as const,
        researchedAt: new Date().toISOString(),
        serperUsed: false,
      };

      const profile = {
        id: d.prospectId,
        name: d.prospectName,
        firstName: d.prospectName.split(" ")[0],
        company: prospectData.company,
        jobTitle: prospectData.jobTitle ?? "",
        email: "email" in prospectData ? prospectData.email : undefined,
        linkedInUrl: "linkedInUrl" in prospectData ? prospectData.linkedInUrl : undefined,
      };

      // Garantir que linkedInUrl vient toujours de la DB, jamais de Claude.
      // Claude peut halluciner des URLs plausibles (mathieu-dias au lieu de
      // mathieu-dias-6482b0296). La valeur DB est la seule source de vérité.
      const dbLinkedInUrl = "linkedInUrl" in prospectData ? (prospectData.linkedInUrl ?? undefined) : undefined;

      try {
        if (d.actionType === "CSO_LAUNCH_LINKEDIN") {
          const [msg, followup] = await Promise.all([
            generateCsoMessages(profile, research, brand, "LINKEDIN"),
            generateCsoMessages(profile, research, brand, "FOLLOWUP"),
          ]);
          const sig = workspace?.signature ? `\n\n${workspace.signature}` : "";
          return {
            ...d,
            actionData: {
              ...d.actionData,
              ...(dbLinkedInUrl ? { linkedInUrl: dbLinkedInUrl } : {}),
              postConnectionMessage: msg.content + sig,
              followupMessage: followup.content + sig,
              _angle: msg.angle,
            },
          };

        } else if (d.actionType === "CSO_LAUNCH_EMAIL") {
          const sig = workspace?.signature ? `\n\n${workspace.signature}` : "";
          const msg = await generateCsoMessages(profile, research, brand, "EMAIL");
          return { ...d, actionData: { ...d.actionData, subject: msg.subject, content: msg.content + sig, _angle: msg.angle } };

        } else if (d.actionType === "CSO_FOLLOWUP") {
          const sig = workspace?.signature ? `\n\n${workspace.signature}` : "";
          const lastMsg = "lastMessage" in prospectData ? (prospectData.lastMessage ?? undefined) : undefined;
          const channel = "channel" in prospectData ? (prospectData.channel as "EMAIL" | "LINKEDIN" | "FOLLOWUP") : "EMAIL";
          const msg = await generateCsoMessages(profile, research, brand, channel === "LINKEDIN" ? "LINKEDIN" : "FOLLOWUP", lastMsg);
          return { ...d, actionData: { ...d.actionData, subject: msg.subject, content: msg.content + sig, _angle: msg.angle } };
        }
      } catch (err) {
        console.warn(`[CSO] Message generation failed for ${d.prospectId}:`, err);
      }

      return d;
    })
  );

  onProgress?.({ step: "personalize_done" });

  return enrichedDecisions;
}

// ─── Step 3: Store decisions ──────────────────────────────────────────────────

// Cooldown par type d'action — évite de re-proposer trop vite après PENDING ou REJECTED
const DEDUP_WINDOWS_MS: Record<CsoActionType, number> = {
  CSO_LAUNCH_LINKEDIN: 7 * 24 * 60 * 60 * 1_000,  // 7j : si déjà tenté, attendre
  CSO_LAUNCH_EMAIL:    7 * 24 * 60 * 60 * 1_000,  // 7j
  CSO_FOLLOWUP:        3 * 24 * 60 * 60 * 1_000,  // 3j : relance tolérée plus vite
  CSO_STALE_REJECT:   14 * 24 * 60 * 60 * 1_000,  // 14j : pas la peine de re-signaler
};

export async function storeCsoDecisions(
  workspaceId: string,
  drafts: CsoDecisionDraft[]
): Promise<number> {
  if (!drafts.length) return 0;

  const now = Date.now();

  // Fetch existing PENDING + recently REJECTED decisions, letting each action type
  // use its own cooldown window for filtering.
  const longestWindow = Math.max(...Object.values(DEDUP_WINDOWS_MS));
  const windowStart = new Date(now - longestWindow);

  const [existing, recentRejected] = await Promise.all([
    prisma.agentDecision.findMany({
      where: {
        workspaceId,
        status: "PENDING",
        createdAt: { gte: windowStart },
        actionType: { in: drafts.map((d) => d.actionType) },
      },
      select: { actionType: true, actionData: true, createdAt: true },
    }),
    prisma.agentDecision.findMany({
      where: {
        workspaceId,
        status: "REJECTED",
        updatedAt: { gte: windowStart },
        actionType: { in: drafts.map((d) => d.actionType) },
      },
      select: { actionType: true, actionData: true, updatedAt: true },
    }),
  ]);

  // Build a set of "type:prospectId" keys that are still within their cooldown window
  const blockedKeys = new Set<string>();
  for (const e of existing) {
    const window = DEDUP_WINDOWS_MS[e.actionType as CsoActionType] ?? DEDUP_WINDOWS_MS.CSO_LAUNCH_LINKEDIN;
    if (now - e.createdAt.getTime() < window) {
      const data = e.actionData as Record<string, unknown> | null;
      blockedKeys.add(`${e.actionType}:${data?.prospectId ?? ""}`);
    }
  }
  for (const e of recentRejected) {
    const window = DEDUP_WINDOWS_MS[e.actionType as CsoActionType] ?? DEDUP_WINDOWS_MS.CSO_LAUNCH_LINKEDIN;
    if (now - e.updatedAt.getTime() < window) {
      const data = e.actionData as Record<string, unknown> | null;
      blockedKeys.add(`${e.actionType}:${data?.prospectId ?? ""}`);
    }
  }

  const fresh = drafts.filter(
    (d) => !blockedKeys.has(`${d.actionType}:${d.prospectId}`)
  );

  if (!fresh.length) return 0;

  await prisma.agentDecision.createMany({
    data: fresh.map((d) => ({
      workspaceId,
      actionType: d.actionType,
      reasoning: d.reasoning,
      priority: d.priority,
      status: "PENDING",
      actionData: {
        prospectId: d.prospectId,
        prospectName: d.prospectName,
        ...d.actionData,
      },
    })),
  });

  return fresh.length;
}

// ─── Step 4: Execute an approved decision ─────────────────────────────────────

export async function executeCsoDecision(
  decisionId: string,
  workspaceId: string
): Promise<{ ok: boolean; message: string }> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, workspaceId, status: "APPROVED" },
  });

  if (!decision) return { ok: false, message: "Décision introuvable ou déjà exécutée" };

  const data = decision.actionData as Record<string, unknown> & { prospectId: string };

  try {
    const now = new Date();

    if (decision.actionType === "CSO_LAUNCH_LINKEDIN") {
      const sequence = await prisma.outreachSequence.create({
        data: {
          workspaceId,
          prospectId: data.prospectId,
          name: `LinkedIn CSO — ${data.prospectName as string}`,
          isActive: true,
        },
      });

      // ── Séquence conditionnelle ───────────────────────────────────────────
      // Step 1 : Demande de connexion (immédiate)
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 1,
          channel: "LINKEDIN",
          linkedInAction: "CONNECTION_REQUEST",
          content: (data.connectNote as string) ?? "",
          status: "PENDING",
          scheduledAt: null,
        },
      });

      // Step 2 : Message post-connexion (attend que la connexion soit acceptée)
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 2,
          channel: "LINKEDIN",
          linkedInAction: "POST_CONNECTION_MESSAGE",
          content: (data.postConnectionMessage as string) ?? "",
          status: "PENDING",
          scheduledAt: FAR_FUTURE,
          metadata: { smartBranch: true, waitingFor: "CONNECTION_ACCEPTED" },
        },
      });

      // Step 3 : Fallback si connexion non acceptée après 7 jours
      // (contenu généré lazily par processPendingBranches si step.content vide)
      const notAcceptedAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 3,
          channel: "EMAIL",
          content: "",  // généré lazily au moment où la branche se déclenche
          status: "PENDING",
          scheduledAt: notAcceptedAt,
          metadata: { smartBranch: true, waitingFor: "NOT_ACCEPTED", daysThreshold: 7 },
        },
      });

      // Step 4 : Relance si pas de réponse après 5j (activé par onConnectionAccepted)
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 4,
          channel: "LINKEDIN",
          linkedInAction: "FOLLOWUP_MESSAGE",
          content: (data.followupMessage as string) ?? "",
          status: "PENDING",
          scheduledAt: FAR_FUTURE,
          metadata: { smartBranch: true, waitingFor: "NO_REPLY", daysThreshold: 5 },
        },
      });

      // Le prospect reste NEW jusqu'à ce que la connexion soit acceptée
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { lastInteractionAt: now },
      });
    } else if (decision.actionType === "CSO_LAUNCH_EMAIL") {
      const sequence = await prisma.outreachSequence.create({
        data: {
          workspaceId,
          prospectId: data.prospectId,
          name: `Email CSO — ${data.prospectName as string}`,
          isActive: true,
        },
      });
      // Step 1 : Email principal (immédiat)
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 1,
          channel: "EMAIL",
          subject: (data.subject as string) ?? "(sans objet)",
          content: (data.content as string) ?? "",
          status: "PENDING",
          scheduledAt: null,
        },
      });
      // Step 2 : Escalade LinkedIn si email ouvert mais pas répondu après 5 jours
      // Contenu généré lazily par processPendingBranches quand la condition fire
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 2,
          channel: "LINKEDIN",
          content: "",
          status: "PENDING",
          scheduledAt: FAR_FUTURE,
          metadata: { smartBranch: true, waitingFor: "EMAIL_OPENED_NO_REPLY", daysThreshold: 5 },
        },
      });
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { status: "CONTACTED", lastInteractionAt: now },
      });
    } else if (decision.actionType === "CSO_FOLLOWUP") {
      let sequence = await prisma.outreachSequence.findFirst({
        where: { workspaceId, prospectId: data.prospectId, isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (!sequence) {
        sequence = await prisma.outreachSequence.create({
          data: {
            workspaceId,
            prospectId: data.prospectId,
            name: `Relance CSO — ${data.prospectName as string}`,
            isActive: true,
          },
        });
      }
      const lastStep = await prisma.sequenceStep.findFirst({
        where: { sequenceId: sequence.id },
        orderBy: { stepNumber: "desc" },
      });
      const nextStep = (lastStep?.stepNumber ?? 0) + 1;
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: nextStep,
          channel: ((data.channel as string) ?? "EMAIL") as SequenceChannel,
          subject: (data.subject as string) ?? undefined,
          content: (data.content as string) ?? "",
          status: "PENDING",
          scheduledAt: null,
        },
      });
      // Reset lastInteractionAt so the follow-up cooldown restarts
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { lastInteractionAt: now },
      });
    } else if (decision.actionType === "CSO_STALE_REJECT") {
      // Cancel active sequences before marking rejected
      await prisma.sequenceStep.updateMany({
        where: {
          sequence: { workspaceId, prospectId: data.prospectId },
          status: "PENDING",
        },
        data: { status: "SKIPPED" },
      });
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { status: "REJECTED" },
      });
    }

    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: { status: "EXECUTED", executedAt: new Date() },
    });

    return { ok: true, message: "Exécuté avec succès" };
  } catch (err) {
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: { status: "FAILED", result: { error: String(err) } },
    });
    return { ok: false, message: String(err) };
  }
}
