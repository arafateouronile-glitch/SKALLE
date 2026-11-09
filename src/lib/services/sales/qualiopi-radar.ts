/**
 * 🎓 Qualiopi Radar — ICP organismes de formation certifiés Qualiopi
 *
 * Source : cache local `QualiopiOrganism`, synchronisé hebdomadairement depuis
 * le registre ouvert "Liste Publique des Organismes de Formation" (data.gouv.fr,
 * cf. `sync-qualiopi-registry.ts`). Pas de date de délivrance de certification
 * disponible dans cette donnée ouverte (celle-ci existe côté France Compétences,
 * réservée aux administrations habilitées DataPass, usage commercial exclu) —
 * ce radar cible donc l'ensemble des organismes certifiés comme pool ICP large,
 * sans déclencheur temporel précis.
 *
 * Comme Signals Radar / Local Radar, la donnée source ne contient aucun nom de
 * personne (juste SIREN + dénomination) : les leads importés restent au niveau
 * entreprise jusqu'à résolution du décideur (`decision-maker-resolver.ts`), qui
 * tente ici un lookup INSEE direct par SIREN avant la recherche LinkedIn.
 */

import { getClaude } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { prisma } from "@/lib/prisma";
import { useCredits, CREDIT_COSTS, type OperationType } from "@/lib/credits";

const SCAN_OP: OperationType = "qualiopi_radar_scan";

// ═══════════════════════════════════════════════════════════════════════════
// 📡 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type QualiopiCertifCategory =
  | "actionsDeFormation"
  | "bilansDeCompetences"
  | "VAE"
  | "actionsDeFormationParApprentissage";

// Codes région INSEE (adressePhysiqueOrganismeFormation.codeRegion du CSV source)
// — table officielle, stable depuis la réforme territoriale de 2016.
export const FRENCH_REGION_LABELS: Record<string, string> = {
  "01": "Guadeloupe",
  "02": "Martinique",
  "03": "Guyane",
  "04": "La Réunion",
  "06": "Mayotte",
  "11": "Île-de-France",
  "24": "Centre-Val de Loire",
  "27": "Bourgogne-Franche-Comté",
  "28": "Normandie",
  "32": "Hauts-de-France",
  "44": "Grand Est",
  "52": "Pays de la Loire",
  "53": "Bretagne",
  "75": "Nouvelle-Aquitaine",
  "76": "Occitanie",
  "84": "Auvergne-Rhône-Alpes",
  "93": "Provence-Alpes-Côte d'Azur",
  "94": "Corse",
};

export const QUALIOPI_CATEGORY_LABELS: Record<QualiopiCertifCategory, string> = {
  actionsDeFormation: "Actions de formation",
  bilansDeCompetences: "Bilans de compétences",
  VAE: "VAE",
  actionsDeFormationParApprentissage: "Apprentissage",
};

const CATEGORY_TO_COLUMN: Record<QualiopiCertifCategory, "certifActionsFormation" | "certifBilanCompetences" | "certifVAE" | "certifApprentissage"> = {
  actionsDeFormation: "certifActionsFormation",
  bilansDeCompetences: "certifBilanCompetences",
  VAE: "certifVAE",
  actionsDeFormationParApprentissage: "certifApprentissage",
};

export interface QualiopiSearchCriteria {
  region?: string;
  certifCategories?: QualiopiCertifCategory[];
  limit?: number;
}

export interface QualiopiLead {
  siren: string;
  denomination: string;
  nda: string;
  region: string | null;
  city: string | null;
  zipCode: string | null;
  certifCategories: QualiopiCertifCategory[];
  nbStagiaires: number | null;
  suggestedHook: string;
}

export interface QualiopiScanResult {
  success: boolean;
  leads?: QualiopiLead[];
  total?: number;
  error?: string;
  creditsUsed?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. HOOK IA
// ═══════════════════════════════════════════════════════════════════════════

const HOOK_SYSTEM = `Tu es un expert en vente B2B pour des prestataires qui accompagnent les organismes de formation (qualité, conformité, outils pédagogiques). Rédige une accroche commerciale percutante (150 caractères MAXIMUM) pour un organisme certifié Qualiopi. Règles absolues : ton direct et professionnel, PAS de politesse excessive, PAS de date ou délai précis (on ne connaît pas la date de certification de cet organisme), mentionne le maintien de la certification ou l'accompagnement qualité comme angle. Format : texte brut, pas de guillemets.`;

export async function generateQualiopiHook(
  denomination: string,
  categories: QualiopiCertifCategory[]
): Promise<string> {
  const llm = getClaude();
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", HOOK_SYSTEM],
    [
      "human",
      "Organisme : {denomination}. Certifié pour : {categories}. Génère l'accroche (150 chars max).",
    ],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const hook = await chain.invoke({
    denomination,
    categories: categories.map((c) => QUALIOPI_CATEGORY_LABELS[c]).join(", ") || "formation",
  });
  return hook.trim().slice(0, 250); // Safety cap
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SCAN (requête cache local + hooks IA) — pour l'UI
// ═══════════════════════════════════════════════════════════════════════════

export async function scanQualiopiOrganisms(
  userId: string,
  criteria: QualiopiSearchCriteria
): Promise<QualiopiScanResult> {
  const creditResult = await useCredits(userId, SCAN_OP);
  if (!creditResult.success) {
    return {
      success: false,
      error: creditResult.error ?? "Crédits insuffisants",
      creditsUsed: CREDIT_COSTS[SCAN_OP],
    };
  }

  const limit = Math.min(criteria.limit ?? 25, 25);
  const categories = criteria.certifCategories?.length
    ? criteria.certifCategories
    : (Object.keys(CATEGORY_TO_COLUMN) as QualiopiCertifCategory[]);

  const organisms = await prisma.qualiopiOrganism.findMany({
    where: {
      ...(criteria.region?.trim() ? { region: criteria.region.trim() } : {}),
      OR: categories.map((c) => ({ [CATEGORY_TO_COLUMN[c]]: true })),
    },
    take: limit,
    orderBy: { syncedAt: "desc" },
  });

  if (organisms.length === 0) {
    return { success: true, leads: [], total: 0, creditsUsed: CREDIT_COSTS[SCAN_OP] };
  }

  const results = await Promise.allSettled(
    organisms.map(async (org): Promise<QualiopiLead> => {
      const activeCategories = (Object.keys(CATEGORY_TO_COLUMN) as QualiopiCertifCategory[]).filter(
        (c) => org[CATEGORY_TO_COLUMN[c]]
      );
      const hook = await generateQualiopiHook(org.denomination, activeCategories);
      return {
        siren: org.siren,
        denomination: org.denomination,
        nda: org.nda,
        region: org.region,
        city: org.city,
        zipCode: org.zipCode,
        certifCategories: activeCategories,
        nbStagiaires: org.nbStagiaires,
        suggestedHook: hook,
      };
    })
  );

  const leads: QualiopiLead[] = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") leads.push(r.value);
  });

  return { success: true, leads, total: leads.length, creditsUsed: CREDIT_COSTS[SCAN_OP] };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. IMPORT CRM (batch)
// ═══════════════════════════════════════════════════════════════════════════

export interface QualiopiProspectBasic {
  id: string;
  name: string;
  email: string | null;
  company: string;
  jobTitle: string | null;
}

export interface BulkQualiopiResult {
  imported: number;
  prospects: QualiopiProspectBasic[];
}

/**
 * Importe des leads Qualiopi Radar en CRM. Au niveau entreprise (pas de nom de
 * personne connu à cette étape) — n'émet volontairement PAS `prospect/created`
 * ici (contrairement à Local Radar) : la résolution du décideur
 * (`resolve-radar-decision-makers`, cron) est ce qui déclenchera l'enrichissement
 * une fois un nom réel trouvé, pour éviter de dépenser un crédit
 * `auto_enrichment` pour rien tant que `name === company`.
 */
export async function bulkSaveQualiopiLeads(
  workspaceId: string,
  leads: QualiopiLead[]
): Promise<BulkQualiopiResult> {
  const prospects: QualiopiProspectBasic[] = [];
  let imported = 0;

  for (const lead of leads) {
    try {
      const email = `qualiopi+${lead.siren}@qualiopi.skalle`;

      const notes = [
        `NDA : ${lead.nda}`,
        `Certifié pour : ${lead.certifCategories.map((c) => QUALIOPI_CATEGORY_LABELS[c]).join(", ")}`,
        lead.nbStagiaires != null ? `Stagiaires déclarés : ${lead.nbStagiaires}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const location = [lead.zipCode, lead.city].filter(Boolean).join(" ") || null;

      const prospect = await prisma.prospect.upsert({
        where: { email_workspaceId: { email, workspaceId } },
        update: { suggestedHook: lead.suggestedHook, updatedAt: new Date() },
        create: {
          name: lead.denomination,
          company: lead.denomination,
          jobTitle: null,
          email,
          linkedInUrl: `https://www.societe.com/societe/${lead.siren}.html`,
          location: location ?? undefined,
          notes,
          status: "NEW",
          source: "QUALIOPI_REGISTRY",
          suggestedHook: lead.suggestedHook,
          platform: "REGISTRY",
          workspaceId,
          enrichmentData: {
            siren: lead.siren,
            nda: lead.nda,
            certifCategories: lead.certifCategories,
          },
        },
        select: { id: true, name: true, email: true, company: true, jobTitle: true },
      });
      prospects.push(prospect);
      imported++;
    } catch (err) {
      console.error(`[QualiopiRadar] Erreur import ${lead.denomination}:`, err);
    }
  }

  return { imported, prospects };
}
