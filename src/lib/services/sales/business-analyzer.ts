/**
 * Business Analyzer — Analyse profonde du business pour dériver les ICP
 *
 * Flux : brandVoice + convertis → Claude → ICPSegments → Personas
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { checkBudget, trackSpend } from "@/lib/ai/budget-guard";
import { z } from "zod";

function stripMarkdownJson(raw: string): string {
  return raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ICPSegmentSchema = z.object({
  type: z.enum(["DIRECT_CLIENT", "PRESCRIPTEUR", "ENTERPRISE"]),
  name: z.string().min(3),
  reasoning: z.string().min(50),
  jobTitles: z.array(z.string()).min(1),
  apolloTitles: z.array(z.string()).min(1),
  industries: z.array(z.string()),
  companySizes: z.array(z.string()),
  locations: z.array(z.string()),
  keywords: z.array(z.string()),
  painPoints: z.array(z.string()).min(1),
  buyingTriggers: z.array(z.string()).min(1),
  seniorityLevels: z.array(z.string()).min(1),
});

const BusinessAnalysisSchema = z.object({
  businessSummary: z.string().min(20),
  prescriptorNeeded: z.boolean(),
  prescriptorReasoning: z.string().optional(),
  segments: z.array(ICPSegmentSchema).min(1).max(3),
});

export type ICPSegment = z.infer<typeof ICPSegmentSchema>;
export type BusinessAnalysis = z.infer<typeof BusinessAnalysisSchema>;

// ─── Core Analysis ────────────────────────────────────────────────────────────

export async function analyzeBusinessForICP(
  workspaceId: string
): Promise<BusinessAnalysis | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      name: true,
      brandVoice: true,
      user: { select: { plan: true } },
    },
  });

  if (!workspace) return null;

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const hasContext = !!(bv.offer || bv.sector || bv.audience || bv.uvp);
  if (!hasContext) return null;

  const plan = workspace.user?.plan ?? "AGENCY";
  const budget = await checkBudget(workspaceId, "cso_icp_analysis", "claude-sonnet-4-6", plan);
  if (!budget.allowed) {
    console.warn(`[BusinessAnalyzer] Budget dépassé pour ${workspaceId}`);
    return null;
  }

  // Patterns réels : qui convertit déjà
  const convertedProspects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      status: { in: ["CONVERTED", "MEETING_BOOKED", "RESPONDED"] },
    },
    select: { name: true, company: true, jobTitle: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const businessCtx = [
    workspace.name ? `Entreprise : ${workspace.name}` : null,
    bv.offer ? `Offre : ${bv.offer}` : null,
    bv.sector ? `Secteur : ${bv.sector}` : null,
    bv.audience ? `Audience actuelle : ${bv.audience}` : null,
    bv.uvp ? `Proposition de valeur unique : ${bv.uvp}` : null,
    bv.targetResult ? `Résultat promis aux clients : ${bv.targetResult}` : null,
    bv.features ? `Fonctionnalités clés : ${bv.features}` : null,
    bv.clients ? `Clients actuels (exemples) : ${bv.clients}` : null,
    bv.objectives ? `Objectifs : ${bv.objectives}` : null,
  ].filter(Boolean).join("\n");

  const convertedCtx =
    convertedProspects.length > 0
      ? `\nClients convertis / meetings obtenus (${convertedProspects.length}) — patterns réels :\n` +
        convertedProspects
          .map((p) => `- ${p.name} | ${p.company} | ${p.jobTitle ?? "poste inconnu"}`)
          .join("\n")
      : "\nAucun converti encore — analyse basée sur le contexte business uniquement.";

  const systemPrompt = `Tu es un expert en stratégie commerciale B2B et en définition d'ICP (Ideal Customer Profile).

Tu analyses un business en profondeur et identifies ses segments clients idéaux avec assez de précision pour trouver des prospects via Apollo.io et LinkedIn.

Règles absolues :
- 1 à 3 segments maximum (jamais plus)
- DIRECT_CLIENT : toujours présent — le décideur/utilisateur direct du produit
- PRESCRIPTEUR : seulement si le produit peut être recommandé/revendu par des consultants, agences, intégrateurs ou freelances à leurs propres clients. Si non, ne l'inclus pas.
- ENTERPRISE : seulement si le produit a une vraie déclinaison grand compte (500+ employés)
- jobTitles : titres FR exacts tels qu'ils apparaissent sur LinkedIn France
- apolloTitles : équivalents EN pour Apollo.io (Apollo indexe surtout en anglais)
- companySizes : format Apollo exact : "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
- seniorityLevels : uniquement parmi ["C-Level", "VP", "Director", "Manager", "Individual Contributor"]
- reasoning : explique en détail POURQUOI ce segment a besoin du produit, avec les douleurs spécifiques

Réponds UNIQUEMENT avec un JSON valide. Aucun texte avant ou après.`;

  const humanPrompt = `Business à analyser :
${businessCtx}
${convertedCtx}

Analyse profondément ce business. Réfléchis à :
1. Quel est le core problème que ce produit résout ?
2. Qui souffre de ce problème le plus intensément (décideur direct) ?
3. Y a-t-il des intermédiaires qui pourraient prescrire ce produit à leurs clients ?
4. Le produit est-il adapté aux grands comptes ?

JSON attendu :
{
  "businessSummary": "2 phrases claires sur ce que fait le business et pour qui",
  "prescriptorNeeded": true,
  "prescriptorReasoning": "Pourquoi des consultants/agences X pourraient recommander ce produit à leurs clients Y",
  "segments": [
    {
      "type": "DIRECT_CLIENT",
      "name": "Responsables Formation PME",
      "reasoning": "Les responsables formation PME souffrent de la charge administrative liée à Qualiopi... [min 50 mots]",
      "jobTitles": ["Responsable Formation", "Directeur des Ressources Humaines", "DRH"],
      "apolloTitles": ["Training Manager", "HR Director", "Learning & Development Manager", "Head of HR"],
      "industries": ["Formation professionnelle", "Ressources humaines"],
      "companySizes": ["11-50", "51-200"],
      "locations": ["France"],
      "keywords": ["qualiopi", "OPCO", "formation continue", "bilan de compétences"],
      "painPoints": ["gestion administrative chronophage", "risque non-conformité Qualiopi", "reporting OPCO"],
      "buyingTriggers": ["audit Qualiopi prévu", "croissance du nombre de stagiaires", "recrutement formateur"],
      "seniorityLevels": ["Manager", "Director", "C-Level"]
    }
  ]
}`;

  try {
    const claude = getClaude();
    const parser = getStringParser();

    const response = await claude.invoke([
      new SystemMessage({ content: systemPrompt }),
      new HumanMessage({ content: humanPrompt }),
    ]);

    await trackSpend(workspaceId, "cso_icp_analysis").catch(() => undefined);

    const raw = await parser.invoke(response);
    const clean = stripMarkdownJson(raw);
    return BusinessAnalysisSchema.parse(JSON.parse(clean));
  } catch (err) {
    console.error("[BusinessAnalyzer] Échec analyse ICP:", err);
    return null;
  }
}

// ─── Persona upsert ───────────────────────────────────────────────────────────

export async function upsertPersonasFromAnalysis(
  workspaceId: string,
  analysis: BusinessAnalysis
): Promise<number> {
  let count = 0;

  for (const seg of analysis.segments) {
    const raw = {
      type: seg.type,
      industry: seg.industries[0] ?? null,
      industries: seg.industries,
      jobTitles: seg.jobTitles,
      apolloTitles: seg.apolloTitles,
      companySizes: seg.companySizes,
      locations: seg.locations,
      keywords: seg.keywords,
      painPoints: seg.painPoints,
      buyingTriggers: seg.buyingTriggers,
      seniorityLevels: seg.seniorityLevels,
      reasoning: seg.reasoning,
      businessSummary: analysis.businessSummary,
      generatedAt: new Date().toISOString(),
    };

    const existing = await prisma.persona.findFirst({
      where: { workspaceId, name: seg.name },
    });

    if (existing) {
      await prisma.persona.update({
        where: { id: existing.id },
        data: { raw, status: "ACTIVE" },
      });
    } else {
      await prisma.persona.create({
        data: { workspaceId, name: seg.name, status: "ACTIVE", raw },
      });
    }
    count++;
  }

  return count;
}
