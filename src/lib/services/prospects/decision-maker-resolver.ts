/**
 * 🧑‍💼 Résolution d'un décideur nommé pour Signals Radar / Local Radar / Qualiopi Radar
 *
 * Ces radars ne fournissent qu'un nom d'entreprise (`Prospect.name ===
 * Prospect.company`, email placeholder) — aucun nom de personne, donc aucun
 * enrichissement email (Dropcontact) n'est possible tel quel. Ce module trouve
 * un décideur plausible, remplace le lead "entreprise" par un lead "personne
 * nommée", et lève le placeholder email pour le rendre éligible au cascade
 * générique d'enrichissement (`auto-enrichment.ts` → Serper → Dropcontact →
 * Apollo).
 *
 * Deux stratégies de résolution :
 * - Qualiopi Radar (SIREN exact connu) : lookup INSEE direct
 *   (`findDirigeantBySiren`, gratuit, plus fiable) en priorité.
 * - Signals/Local Radar (pas de SIREN, juste un nom libre) : recherche LinkedIn
 *   approximative (`searchLinkedIn`, Serper) — inchangé.
 * Le repli Serper s'applique aussi au Qualiopi Radar si l'INSEE ne renvoie rien.
 */

import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { searchLinkedIn } from "./decision-maker-finder";
import { findDirigeantBySiren } from "./insee-lookup";
import type { SourceType } from "@prisma/client";

const RADAR_SOURCES: SourceType[] = ["JOB_BOARD_SIGNAL", "LOCAL_MAPS", "QUALIOPI_REGISTRY"];
const PLACEHOLDER_EMAIL_SUFFIXES = ["@job.skalle", "@maps.skalle", "@qualiopi.skalle"];
const RETRY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours — cf. plan produit
const ATTEMPT_NOTE_TYPE = "DECISION_MAKER_ATTEMPT";

export interface RadarProspectCandidate {
  id: string;
  name: string;
  company: string;
  workspaceId: string;
}

interface ResolvedDecisionMaker {
  name: string;
  jobTitle: string;
  linkedinUrl: string;
  /** Code NAF/APE — connu seulement via la voie INSEE (Qualiopi Radar), absent
   * sur la voie Serper (Signals/Local Radar). */
  naf: string | null;
  nafLabel: string | null;
}

/** SIREN stocké dans `enrichmentData` à la création du lead Qualiopi Radar. */
function extractSiren(enrichmentData: unknown): string | null {
  const data = (enrichmentData ?? {}) as Record<string, unknown>;
  return typeof data.siren === "string" ? data.siren : null;
}

async function findBestDecisionMaker(prospect: {
  source: SourceType | null;
  company: string;
  enrichmentData: unknown;
}): Promise<ResolvedDecisionMaker | null> {
  if (prospect.source === "QUALIOPI_REGISTRY") {
    const siren = extractSiren(prospect.enrichmentData);
    if (siren) {
      const dirigeant = await findDirigeantBySiren(siren);
      if (dirigeant) {
        return {
          name: `${dirigeant.firstName} ${dirigeant.lastName}`.trim(),
          jobTitle: dirigeant.title ?? "",
          linkedinUrl: "", // pas de profil connu via cette voie — conservé tel quel à l'update
          naf: dirigeant.naf,
          nafLabel: dirigeant.nafLabel,
        };
      }
    }
  }

  const contacts = await searchLinkedIn(prospect.company);
  const best = contacts[0];
  return best
    ? { name: best.name, jobTitle: best.jobTitle, linkedinUrl: best.linkedinUrl, naf: null, nafLabel: null }
    : null;
}

function isPlaceholderRadarEmail(email: string | null): boolean {
  return !!email && PLACEHOLDER_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));
}

/**
 * Prospects Signals/Local Radar encore au niveau entreprise (email
 * placeholder), hors ceux déjà tentés il y a moins de 14 jours. Le suivi de
 * tentative passe par `ProspectAiNote` (pas `Prospect.enrichmentData`) —
 * `findUnenrichedProspects` (auto-enrichment.ts) traite `enrichmentData` non
 * nul comme "déjà enrichi avec succès" pour le batch nocturne générique ; y
 * écrire ici rendrait invisible, pour toujours, un prospect dont le décideur
 * est résolu mais dont l'email reste introuvable au premier passage.
 */
export async function findRadarProspectsNeedingDecisionMaker(
  workspaceId: string,
  limit = 10
): Promise<RadarProspectCandidate[]> {
  const retryAfter = new Date(Date.now() - RETRY_WINDOW_MS);

  return prisma.prospect.findMany({
    where: {
      workspaceId,
      source: { in: RADAR_SOURCES },
      OR: PLACEHOLDER_EMAIL_SUFFIXES.map((suffix) => ({ email: { endsWith: suffix } })),
      aiNotes: { none: { type: ATTEMPT_NOTE_TYPE, createdAt: { gte: retryAfter } } },
    },
    take: limit,
    select: { id: true, name: true, company: true, workspaceId: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Tente de résoudre un décideur nommé pour un prospect Signals/Local Radar.
 * Succès : remplace name/jobTitle/linkedInUrl, lève l'email placeholder (→
 * null, éligible au cascade Dropcontact générique) et émet `prospect/created`.
 * Échec : trace juste la tentative (backoff 14j via ProspectAiNote), ne casse
 * rien — le prospect reste au niveau entreprise comme aujourd'hui.
 */
export async function resolveDecisionMaker(
  prospectId: string,
  userId: string
): Promise<{ resolved: boolean; name?: string }> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: {
      id: true,
      name: true,
      company: true,
      jobTitle: true,
      notes: true,
      email: true,
      workspaceId: true,
      source: true,
      enrichmentData: true,
    },
  });
  if (!prospect || !isPlaceholderRadarEmail(prospect.email)) return { resolved: false };

  const best = await findBestDecisionMaker(prospect);

  if (!best) {
    await prisma.prospectAiNote
      .create({
        data: {
          prospectId,
          type: ATTEMPT_NOTE_TYPE,
          content: "Aucun décideur nommé trouvé (INSEE/LinkedIn).",
        },
      })
      .catch(() => null);
    return { resolved: false };
  }

  const originContext =
    `Entreprise d'origine (avant résolution décideur) : ${prospect.company}` +
    (prospect.jobTitle ? ` — poste recherché : ${prospect.jobTitle}` : "");
  const nafContext = best.naf ? `NAF : ${best.naf}${best.nafLabel ? ` — ${best.nafLabel}` : ""}` : null;
  const notes = [prospect.notes, originContext, nafContext].filter(Boolean).join("\n");

  const baseEnrichmentData = (prospect.enrichmentData ?? {}) as Record<string, unknown>;
  const enrichmentData = best.naf ? { ...baseEnrichmentData, naf: best.naf, nafLabel: best.nafLabel } : undefined;

  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      name: best.name,
      jobTitle: best.jobTitle || prospect.jobTitle,
      linkedInUrl: best.linkedinUrl || undefined, // conserve l'URL existante si non fournie (voie INSEE)
      email: null, // lève le placeholder — éligible au cascade Dropcontact générique
      notes,
      ...(enrichmentData && { enrichmentData }),
    },
  });

  await inngest
    .send({ name: "prospect/created", data: { prospectId, workspaceId: prospect.workspaceId, userId } })
    .catch(() => {/* fire-and-forget */});

  return { resolved: true, name: best.name };
}
