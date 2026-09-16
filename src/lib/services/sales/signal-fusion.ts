/**
 * 🧬 Signal Fusion — Score composite multi-radar (Goskalle)
 *
 * Les 3 radars CSO (Signals/Local/Newborn) tournent aujourd'hui en silo :
 * chacun crée ses propres `Prospect`, sans jamais se recouper. Ce service
 * rapproche les prospects qui désignent la même entreprise réelle (même
 * domaine ou même nom normalisé) et calcule un score composite qui récompense
 * explicitement le cumul de signaux hétérogènes — une entreprise détectée par
 * 2 radars dépasse toujours une entreprise détectée par 1 seul, à score de
 * base égal. Aucun concurrent identifié (GojiBerry, RB2B, Clay) ne fait cette
 * fusion nativement.
 */

import { prisma } from "@/lib/prisma";
import type { Prospect, SourceType } from "@prisma/client";

const LEGAL_SUFFIXES = /\b(sarl|sas|sasu|sa|eurl|sci|inc|llc|ltd|corp|co)\b/g;

// ═══════════════════════════════════════════════════════════════════════════
// 1. CLÉ DE RAPPROCHEMENT
// ═══════════════════════════════════════════════════════════════════════════

function extractDomain(enrichmentData: unknown): string | null {
  if (!enrichmentData || typeof enrichmentData !== "object") return null;
  const data = enrichmentData as Record<string, unknown>;
  const raw =
    (typeof data.domain === "string" && data.domain) ||
    (typeof data.website === "string" && data.website) ||
    null;
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function slugifyCompany(company: string): string {
  return company
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(LEGAL_SUFFIXES, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Valeurs placeholder connues écrites à la place d'un vrai nom d'entreprise
// quand la donnée manque (ex: "LinkedIn" utilisé par erreur comme nom
// d'entreprise à la place du canal source — cf. process-profile/route.ts et
// linkedin-content.js — ou "N/A" par le parseur CSV). Chacune se slugifie en
// une clé valide de plusieurs caractères et provoquerait des fusions absurdes
// entre prospects sans rapport si on ne l'excluait pas explicitement ici.
const PLACEHOLDER_COMPANIES = new Set(["linkedin", "n/a"]);

/**
 * Vrai si `company` n'est pas un nom d'entreprise exploitable — placeholder connu
 * (cf. PLACEHOLDER_COMPANIES), tiret "—" posé par `captureWarmProspect` en attendant
 * la résolution d'entreprise, ou chaîne qui ne slugifie en rien d'utilisable.
 * Réutilisé par tout appelant qui a besoin de savoir, avant de dépenser un crédit
 * d'enrichissement, si `company` vaut la peine d'être envoyé à un provider tiers
 * (ex: `auto-enrichment.ts` avant un appel Dropcontact).
 */
export function isPlaceholderCompany(company: string): boolean {
  const trimmed = company.trim().toLowerCase();
  if (!trimmed || PLACEHOLDER_COMPANIES.has(trimmed)) return true;
  return slugifyCompany(company).length < 2;
}

/**
 * `null` = pas de signal de rapprochement fiable (ex: warm leads LinkedIn créés
 * avec `company: "—"` par `captureWarmProspect`, ou un placeholder connu comme
 * "LinkedIn"/"N/A" — cf. PLACEHOLDER_COMPANIES) — un nom d'entreprise
 * placeholder produirait des collisions absurdes entre prospects sans rapport.
 * Ces prospects restent hors fusion tant qu'une vraie donnée d'entreprise
 * n'est pas disponible (ex: après enrichissement).
 */
export function computeDedupKey(input: { company: string; enrichmentData?: unknown }): string | null {
  const domain = extractDomain(input.enrichmentData);
  if (domain) return domain;
  if (isPlaceholderCompany(input.company)) return null;
  const slug = slugifyCompany(input.company);
  return slug.length >= 2 ? slug : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. NORMALISATION PAR SOURCE
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_PAIN_SCORE: Record<string, number> = {
  NO_WEBSITE: 85,
  BAD_REPUTATION: 65,
  LOW_VISIBILITY: 50,
};

type FusableProspect = Pick<
  Prospect,
  "source" | "intentScore" | "score" | "enrichmentData"
>;

export function normalizeSourceScore(prospect: FusableProspect): number {
  switch (prospect.source) {
    case "JOB_BOARD_SIGNAL":
      return prospect.intentScore ?? 50;
    case "LOCAL_MAPS": {
      const data = prospect.enrichmentData as Record<string, unknown> | null;
      const tag = typeof data?.localPainTag === "string" ? data.localPainTag : null;
      return tag ? (LOCAL_PAIN_SCORE[tag] ?? 40) : 40;
    }
    case "NEW_COMPANY_REGISTRY":
      return 40; // signal de fraîcheur seul, plus faible que les 2 autres radars
    case "APOLLO_ICP_MATCH":
      // Signal de ciblage/fit (profil pré-filtré sur l'ICP), pas d'intention comportementale —
      // le score de fit est déjà calculé à la création selon la qualité de l'email trouvé
      // (cso-sales.ts : vérifié=75, trouvé=65, absent=55)
      return prospect.score || 50;
    case "LINKEDIN":
      // Score déjà calculé par computeWarmScore (engagement) ou l'import Apollo —
      // pas de recalcul ici, juste la normalisation vers l'échelle commune.
      return prospect.score || 0;
    default:
      return prospect.score || 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. FUSION D'UN GROUPE
// ═══════════════════════════════════════════════════════════════════════════

/** Prime multiplicative par source distincte au-delà de la première. */
const MULTI_SOURCE_BONUS = 10;

function computeComposite(group: FusableProspect[]): {
  compositeScore: number;
  fusionSources: SourceType[];
} {
  const scores = group.map(normalizeSourceScore);
  const distinctSources = Array.from(
    new Set(group.map((p) => p.source).filter((s): s is SourceType => s !== null))
  );
  const base = Math.max(0, ...scores);
  const compositeScore = Math.min(100, base + MULTI_SOURCE_BONUS * Math.max(0, distinctSources.length - 1));
  return { compositeScore, fusionSources: distinctSources };
}

/**
 * Recalcule le score composite d'un groupe de prospects partageant le même
 * `dedupKey` dans un workspace, et l'écrit sur chaque ligne du groupe.
 */
export async function fuseSingleDedupGroup(workspaceId: string, dedupKey: string): Promise<number> {
  const group = await prisma.prospect.findMany({
    where: { workspaceId, dedupKey },
    select: { id: true, source: true, intentScore: true, score: true, enrichmentData: true },
  });
  if (group.length === 0) return 0;

  const { compositeScore, fusionSources } = computeComposite(group);

  await prisma.prospect.updateMany({
    where: { id: { in: group.map((p) => p.id) } },
    data: { compositeScore, fusionSources },
  });

  return group.length;
}

/**
 * Calcule et écrit `dedupKey` pour un prospect fraîchement créé, puis fusionne
 * son groupe. Point d'entrée unique appelé par le listener Inngest
 * `signal/prospect-fusion`.
 */
export async function fuseProspectOnCreate(prospectId: string): Promise<void> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { id: true, workspaceId: true, company: true, enrichmentData: true, dedupKey: true },
  });
  if (!prospect) return;

  const dedupKey = prospect.dedupKey ?? computeDedupKey(prospect);
  if (!dedupKey) return; // pas de signal de rapprochement fiable — rien à fusionner

  if (prospect.dedupKey !== dedupKey) {
    await prisma.prospect.update({ where: { id: prospect.id }, data: { dedupKey } });
  }

  await fuseSingleDedupGroup(prospect.workspaceId, dedupKey);
}

/**
 * Backfill : recalcule `dedupKey` + `compositeScore` pour tous les prospects
 * d'un workspace qui n'ont pas encore de `dedupKey` (migration des données
 * existantes, créées avant l'introduction de la fusion).
 */
export async function fuseSignalsForWorkspace(workspaceId: string): Promise<{ groupsFused: number; prospectsTouched: number }> {
  const prospects = await prisma.prospect.findMany({
    where: { workspaceId, dedupKey: null },
    select: { id: true, company: true, enrichmentData: true },
  });

  const keysByProspect = new Map(
    prospects
      .map((p) => [p.id, computeDedupKey(p)] as const)
      .filter((entry): entry is [string, string] => entry[1] !== null)
  );
  const uniqueKeys = new Set(keysByProspect.values());

  for (const [id, dedupKey] of keysByProspect) {
    await prisma.prospect.update({ where: { id }, data: { dedupKey } });
  }

  let prospectsTouched = 0;
  for (const dedupKey of uniqueKeys) {
    prospectsTouched += await fuseSingleDedupGroup(workspaceId, dedupKey);
  }

  return { groupsFused: uniqueKeys.size, prospectsTouched };
}
