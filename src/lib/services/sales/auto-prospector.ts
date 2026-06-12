/**
 * Auto-Prospector — Découverte automatique de prospects ICP
 *
 * Utilise les Personas générés par le business-analyzer pour chercher
 * des prospects via Apollo/Serper et les stocker en DB.
 */

import { prisma } from "@/lib/prisma";
import { findQualifiedLeads, type EnrichedLead } from "@/lib/prospection/enrichment";

interface PersonaRaw {
  type?: string;
  jobTitles?: string[];
  apolloTitles?: string[];
  industries?: string[];
  companySizes?: string[];
  locations?: string[];
  keywords?: string[];
  seniorityLevels?: string[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

async function storeDiscoveredLeads(
  workspaceId: string,
  personaId: string,
  leads: EnrichedLead[]
): Promise<number> {
  if (!leads.length) return 0;

  // Charger les doublons existants pour déduplication
  const existing = await prisma.prospect.findMany({
    where: { workspaceId },
    select: { email: true, name: true, company: true },
  });

  const emailSet = new Set(
    existing.flatMap((p) => (p.email ? [p.email.toLowerCase()] : []))
  );
  const keySet = new Set(
    existing.map((p) => `${p.name.toLowerCase()}:${p.company.toLowerCase()}`)
  );

  let added = 0;

  for (const lead of leads) {
    if (!lead.name || !lead.company || !lead.linkedInUrl) continue;

    const emailKey = lead.email?.toLowerCase();
    const nameKey = `${lead.name.toLowerCase()}:${lead.company.toLowerCase()}`;

    if (emailKey && emailSet.has(emailKey)) continue;
    if (keySet.has(nameKey)) continue;

    try {
      await prisma.prospect.create({
        data: {
          workspaceId,
          personaId,
          name: lead.name,
          company: lead.company,
          jobTitle: lead.jobTitle ?? null,
          email: lead.email ?? null,
          emailVerified: lead.emailVerified ?? false,
          linkedInUrl: lead.linkedInUrl,
          status: "NEW",
          score: lead.leadScore?.overallScore ?? 50,
          enrichmentData: {
            industry: lead.industry ?? null,
            companySize: lead.companySize ?? null,
            location: lead.location ?? null,
            revenue: lead.revenue ?? null,
            autoDiscovered: true,
            discoveredAt: new Date().toISOString(),
            ...(lead.enrichmentData ?? {}),
          },
        },
      });

      if (emailKey) emailSet.add(emailKey);
      keySet.add(nameKey);
      added++;
    } catch {
      // Violation contrainte unique — on ignore
    }
  }

  return added;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export interface AutoDiscoveryResult {
  discovered: number;
  byPersona: Array<{ personaId: string; name: string; count: number }>;
}

export async function autoDiscoverProspects(
  workspaceId: string,
  targetCount = 30
): Promise<AutoDiscoveryResult> {
  const personas = await prisma.persona.findMany({
    where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
    select: { id: true, name: true, raw: true },
  });

  if (!personas.length) return { discovered: 0, byPersona: [] };

  const byPersona: Array<{ personaId: string; name: string; count: number }> = [];
  const perPersona = Math.max(10, Math.ceil(targetCount / personas.length));

  for (const persona of personas) {
    const raw = (persona.raw ?? {}) as PersonaRaw;

    // Apollo préfère les titres EN — on les met en premier
    const jobTitles = [
      ...(raw.apolloTitles ?? []),
      ...(raw.jobTitles ?? []),
    ].slice(0, 8);

    if (!jobTitles.length) {
      byPersona.push({ personaId: persona.id, name: persona.name, count: 0 });
      continue;
    }

    try {
      const result = await findQualifiedLeads({
        jobTitles,
        industries: raw.industries ?? [],
        locations: raw.locations?.length ? raw.locations : ["France"],
        companySizes: raw.companySizes ?? [],
        seniorityLevels: raw.seniorityLevels ?? [],
        keywords: raw.keywords ?? [],
        limit: perPersona,
        provider: "apollo",
      });

      if (!result.success || !result.leads?.length) {
        console.warn(
          `[AutoProspector] Aucun lead pour persona "${persona.name}":`,
          result.error ?? "0 résultats"
        );
        byPersona.push({ personaId: persona.id, name: persona.name, count: 0 });
        continue;
      }

      const added = await storeDiscoveredLeads(workspaceId, persona.id, result.leads);
      console.info(
        `[AutoProspector] Persona "${persona.name}" — ${result.leads.length} trouvés, ${added} ajoutés`
      );
      byPersona.push({ personaId: persona.id, name: persona.name, count: added });
    } catch (err) {
      console.error(`[AutoProspector] Erreur pour "${persona.name}":`, err);
      byPersona.push({ personaId: persona.id, name: persona.name, count: 0 });
    }
  }

  const discovered = byPersona.reduce((s, p) => s + p.count, 0);
  return { discovered, byPersona };
}
