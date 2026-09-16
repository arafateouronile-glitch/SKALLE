/**
 * 🏢 Warm Lead Company Enrichment (Goskalle)
 *
 * Les warm leads capturés par engagement LinkedIn (`captureWarmProspect`,
 * prospector.ts) sont créés avec `company: "—"` — on ne connaît que la
 * personne au moment du like/commentaire, pas son employeur. Sans entreprise,
 * ils ne peuvent pas rejoindre le score composite (`signal-fusion.ts` exige
 * un `dedupKey` fiable). Ce module tente d'extraire l'entreprise depuis le
 * headline public du profil LinkedIn (ex: "Directeur Marketing chez Acme") —
 * une heuristique texte libre, pas une extraction garantie.
 */

import { prisma } from "@/lib/prisma";
import { linkedinProfileTool } from "@/lib/ai/tools";
import { fuseProspectOnCreate } from "@/lib/services/sales/signal-fusion";

const PLACEHOLDER_COMPANY = "—";

// ═══════════════════════════════════════════════════════════════════════════
// 1. PARSING HEURISTIQUE DU HEADLINE
// ═══════════════════════════════════════════════════════════════════════════

const HEADLINE_PATTERNS = [
  /\bchez\s+(.+)$/i,
  /\bat\s+(.+)$/i,
  /\B@\s*(.+)$/,
];

export function parseCompanyFromHeadline(headline: string | null | undefined): string | null {
  if (!headline) return null;
  const trimmed = headline.trim();
  if (!trimmed) return null;

  for (const pattern of HEADLINE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const company = match[1].trim().replace(/[.,;].*$/, "").trim();
      if (company.length >= 2 && company.length <= 80) return company;
    }
  }

  // Repli : format "Poste | Entreprise" — dernier segment
  if (trimmed.includes("|")) {
    const segments = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.length >= 2 && last.length <= 80 && segments.length > 1) return last;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SÉLECTION DES WARM LEADS À ENRICHIR
// ═══════════════════════════════════════════════════════════════════════════

export async function findWarmLeadsNeedingCompany(workspaceId: string, limit = 10) {
  return prisma.prospect.findMany({
    where: { workspaceId, source: "LINKEDIN", company: PLACEHOLDER_COMPANY },
    take: limit,
    select: { id: true, name: true, linkedInUrl: true, company: true },
    orderBy: { createdAt: "desc" },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENRICHISSEMENT D'UN PROSPECT
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichWarmLeadCompany(
  prospectId: string
): Promise<{ enriched: boolean; company?: string }> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { id: true, name: true, linkedInUrl: true, company: true },
  });
  if (!prospect || prospect.company !== PLACEHOLDER_COMPANY) return { enriched: false };
  if (!prospect.linkedInUrl || prospect.linkedInUrl.includes("/search/results/")) {
    return { enriched: false };
  }

  let raw: string;
  try {
    raw = (await linkedinProfileTool.func({
      linkedinUrl: prospect.linkedInUrl,
      fullName: prospect.name,
    } as Parameters<typeof linkedinProfileTool.func>[0])) as string;
  } catch {
    return { enriched: false };
  }

  let data: { headline?: string; error?: string };
  try {
    data = JSON.parse(raw) as { headline?: string; error?: string };
  } catch {
    return { enriched: false };
  }
  if (data.error) return { enriched: false };

  const company = parseCompanyFromHeadline(data.headline);
  if (!company) return { enriched: false };

  await prisma.prospect.update({ where: { id: prospectId }, data: { company } });
  await fuseProspectOnCreate(prospectId);

  return { enriched: true, company };
}
