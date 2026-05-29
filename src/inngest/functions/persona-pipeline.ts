/**
 * Persona Pipeline — orchestration complète du workflow de prospection piloté par persona :
 *
 *   1. enhance   — IA améliore le persona brut → queries optimisées par canal
 *   2. channels  — Fan-out parallèle : Serper LinkedIn + Job Board + INSEE + Local Maps
 *   3. enrich    — Serper enrichit les prospects sans email
 *   4. sequences — Séquences LinkedIn + Email auto-déclenchées pour chaque lead enrichi
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { enhancePersona, type RawPersona, type EnhancedPersona } from "@/lib/ai/persona-enhancer";
import { searchGoogle } from "@/lib/ai/serper";
import { scanSignalsWithoutSaving } from "@/lib/services/sales/intent-signals";
import { scanNewbornLeads, bulkSaveNewbornLeads } from "@/lib/services/sales/newborn-leads";
import { scanLocalBusinesses, bulkProcessLocalLeads } from "@/lib/services/sales/local-scraper";
import { autoEnrichProspect } from "@/lib/prospection/auto-enrichment";
import { randomBytes } from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parse "Name - Title - Company | LinkedIn" title format
function parseLinkedInTitle(title: string): { name: string; jobTitle: string; company: string } {
  const parts = title.replace(/\s*\|\s*LinkedIn\s*$/, "").split(/\s*[-–]\s*/);
  return {
    name: parts[0]?.trim() ?? "",
    jobTitle: parts[1]?.trim() ?? "",
    company: parts[2]?.trim() ?? "",
  };
}

async function createSequenceForProspect(
  prospectId: string,
  workspaceId: string,
  enhanced: EnhancedPersona,
  hasEmail: boolean,
  hasLinkedIn: boolean
) {
  const sequence = await prisma.outreachSequence.create({
    data: {
      prospectId,
      workspaceId,
      name: "Séquence persona auto",
      isActive: false,
    },
  });

  const steps = [];
  let stepNumber = 1;

  if (enhanced.sequenceVariant !== "email_first" && hasLinkedIn) {
    // Étape 1 : LinkedIn connection request
    steps.push({
      sequenceId: sequence.id,
      stepNumber: stepNumber++,
      channel: "LINKEDIN" as const,
      content: enhanced.linkedInRequestNote,
      delayDays: 0,
    });
  }

  if (hasEmail) {
    steps.push({
      sequenceId: sequence.id,
      stepNumber: stepNumber++,
      channel: "EMAIL" as const,
      subject: enhanced.emailSubject,
      content: enhanced.emailBody,
      delayDays: enhanced.sequenceVariant === "email_first" ? 0 : 2,
    });
  }

  if (hasLinkedIn && steps.length > 0) {
    // Follow-up LinkedIn message après email
    steps.push({
      sequenceId: sequence.id,
      stepNumber: stepNumber++,
      channel: "LINKEDIN" as const,
      content: `{{firstname}}, je voulais faire un suivi rapide — avez-vous eu l'occasion de lire mon message ?`,
      delayDays: 5,
    });
  }

  if (steps.length === 0) return null;

  await prisma.sequenceStep.createMany({ data: steps });

  return sequence.id;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

export const runPersonaPipeline = inngest.createFunction(
  {
    id: "run-persona-pipeline",
    name: "Run Persona Prospecting Pipeline",
    retries: 1,
    concurrency: { limit: 2 },
  },
  { event: "persona/run" },
  async ({ event, step }) => {
    const { personaId, workspaceId, userId } = event.data as {
      personaId: string;
      workspaceId: string;
      userId: string;
    };

    // ── 1. Enhance persona with AI ────────────────────────────────────────────

    const enhanced = await step.run("enhance-persona", async () => {
      const persona = await prisma.persona.findUnique({
        where: { id: personaId },
        select: { raw: true },
      });
      if (!persona) throw new Error(`Persona ${personaId} non trouvé`);

      const enhanced = await enhancePersona(persona.raw as unknown as RawPersona);

      await prisma.persona.update({
        where: { id: personaId },
        data: { enhanced: JSON.parse(JSON.stringify(enhanced)), status: "RUNNING" },
      });

      return enhanced as EnhancedPersona;
    });

    // ── 2. Fan-out : all channels in parallel ─────────────────────────────────

    const channelResults = await step.run("run-all-channels", async () => {
      const results = {
        serperProspectIds: [] as string[],
        channelProspectIds: [] as string[],
      };

      // A. Serper LinkedIn discovery — trouve des profils via site:linkedin.com/in
      const serperPromises = enhanced.apifyQueries.slice(0, 2).map(async (query) => {
        try {
          const results = await searchGoogle(`site:linkedin.com/in ${query}`, 10);
          const ids: string[] = [];
          for (const r of results) {
            const url = (r as { link?: string }).link ?? "";
            if (!url.includes("linkedin.com/in/")) continue;
            const { name, jobTitle, company } = parseLinkedInTitle((r as { title?: string }).title ?? "");
            if (!name || name.length < 3) continue;
            const email = `serper+${randomBytes(6).toString("hex")}@discovery.skalle`;
            try {
              const prospect = await prisma.prospect.create({
                data: {
                  name,
                  email,
                  linkedInUrl: url.split("?")[0],
                  company: company || "",
                  jobTitle: jobTitle || undefined,
                  status: "NEW",
                  source: "LINKEDIN",
                  suggestedHook: enhanced.linkedInRequestNote,
                  platform: "LINKEDIN",
                  workspaceId,
                  personaId,
                },
                select: { id: true },
              });
              ids.push(prospect.id);
            } catch { /* duplicate */ }
          }
          return ids;
        } catch (err) {
          console.warn("[Persona/Serper Discovery]", err);
          return [];
        }
      });

      // B. Job Board (Intent Signals)
      const jobBoardPromises = enhanced.jobBoardKeywords.map(async (keyword) => {
        for (const location of enhanced.jobBoardLocations.slice(0, 2)) {
          try {
            const scan = await scanSignalsWithoutSaving(userId, keyword, location);
            if (!scan.success || !scan.signals) continue;
            const ids: string[] = [];
            for (const signal of scan.signals) {
              const email = `signal+${randomBytes(6).toString("hex")}@job.skalle`;
              try {
                const prospect = await prisma.prospect.create({
                  data: {
                    name: signal.companyName,
                    email,
                    linkedInUrl: signal.jobUrl || `https://linkedin.com/company/${signal.companyName.replace(/\s+/g, "-").toLowerCase()}`,
                    company: signal.companyName,
                    jobTitle: signal.jobTitle,
                    location: signal.location,
                    status: "NEW",
                    source: "JOB_BOARD_SIGNAL",
                    suggestedHook: signal.hook,
                    platform: "LINKEDIN",
                    intentScore: signal.intentScore,
                    workspaceId,
                    personaId,
                  },
                  select: { id: true },
                });
                ids.push(prospect.id);
              } catch { /* ignore duplicate */ }
            }
            return ids;
          } catch (err) {
            console.warn("[Persona/JobBoard]", err);
          }
        }
        return [];
      });

      // C. Newborn (INSEE)
      const newbornPromises = enhanced.newbornSectorCodes.map(async (sectorCode) => {
        for (const zipCode of enhanced.newbornLocations.slice(0, 2)) {
          try {
            const scan = await scanNewbornLeads(userId, { daysAgo: 30, sectorCode, zipCode, limit: 10 });
            if (!scan.success || !scan.leads?.length) continue;
            const saved = await bulkSaveNewbornLeads(workspaceId, scan.leads, userId);
            // Attach personaId
            const ids = saved.prospects.map((p) => p.id);
            if (ids.length > 0) {
              await prisma.prospect.updateMany({
                where: { id: { in: ids }, personaId: null },
                data: { personaId },
              });
            }
            return ids;
          } catch (err) {
            console.warn("[Persona/Newborn]", err);
          }
        }
        return [];
      });

      // D. Local Maps
      const localPromise = (async () => {
        try {
          const locations = enhanced.localMapLocations.slice(0, 3);
          const ids: string[] = [];
          for (const location of locations) {
            const scan = await scanLocalBusinesses(userId, `${enhanced.localMapQuery} ${location}`, 10);
            if (!scan.success || !scan.leads?.length) continue;
            const saved = await bulkProcessLocalLeads(workspaceId, scan.leads, userId);
            const pIds = saved.prospects.map((p) => p.id);
            if (pIds.length > 0) {
              await prisma.prospect.updateMany({
                where: { id: { in: pIds }, personaId: null },
                data: { personaId },
              });
            }
            ids.push(...pIds);
          }
          return ids;
        } catch (err) {
          console.warn("[Persona/Local]", err);
          return [];
        }
      })();

      const [serperIds, ...rest] = await Promise.all([
        Promise.all(serperPromises).then((r) => r.flat()),
        Promise.all(jobBoardPromises).then((r) => r.flat()),
        Promise.all(newbornPromises).then((r) => r.flat()),
        localPromise,
      ]);

      const channelIds = rest.flat().filter((id): id is string => typeof id === "string");
      results.serperProspectIds = serperIds.filter((id): id is string => typeof id === "string");
      results.channelProspectIds = channelIds;

      return results;
    });

    const totalFound =
      channelResults.serperProspectIds.length + channelResults.channelProspectIds.length;

    // ── 3. Enrich channel leads (B/C/D) with Apify ────────────────────────────

    const enrichedIds = await step.run("enrich-channel-leads", async () => {
      const toEnrich = await prisma.prospect.findMany({
        where: {
          id: { in: channelResults.channelProspectIds },
          OR: [
            { email: { contains: "@job.skalle" } },
            { email: { contains: "@registry.skalle" } },
            { email: { contains: "@maps.skalle" } },
          ],
        },
        select: { id: true, name: true, company: true, jobTitle: true, email: true, workspaceId: true },
      });

      const enrichedIds: string[] = [];
      for (const prospect of toEnrich) {
        const result = await autoEnrichProspect(prospect).catch(() => ({ enriched: false as const }));
        if (result.enriched) enrichedIds.push(prospect.id);
      }
      return enrichedIds;
    });

    // ── 4. Trigger sequences for all enriched prospects ───────────────────────

    const sequenceCount = await step.run("trigger-sequences", async () => {
      // Prospects with real emails: Apify direct + enriched channel leads
      const enrichedEmails = await prisma.prospect.findMany({
        where: {
          id: { in: [...channelResults.serperProspectIds, ...enrichedIds] },
          NOT: {
            OR: [
              { email: { contains: "@job.skalle" } },
              { email: { contains: "@registry.skalle" } },
              { email: { contains: "@maps.skalle" } },
              { email: { contains: "@direct.skalle" } },
            ],
          },
          sequences: { none: {} }, // pas encore de séquence
        },
        select: { id: true, email: true, linkedInUrl: true },
      });

      let count = 0;
      const sequenceIds: string[] = [];

      for (const p of enrichedEmails) {
        const hasEmail = !!p.email;
        const hasLinkedIn =
          !!p.linkedInUrl &&
          !p.linkedInUrl.startsWith("https://www.google.com/maps") &&
          !p.linkedInUrl.startsWith("https://www.societe.com");

        const sequenceId = await createSequenceForProspect(
          p.id,
          workspaceId,
          enhanced,
          hasEmail,
          hasLinkedIn
        );
        if (sequenceId) {
          sequenceIds.push(sequenceId);
          count++;
        }
      }

      // Fire sequence/start for each sequence
      if (sequenceIds.length > 0) {
        await Promise.all(
          sequenceIds.map((sequenceId) =>
            inngest.send({ name: "sequence/start", data: { sequenceId } }).catch(() => null)
          )
        );
      }

      return count;
    });

    // ── 5. Update persona stats ───────────────────────────────────────────────

    await step.run("update-persona-stats", async () => {
      await prisma.persona.update({
        where: { id: personaId },
        data: {
          status: "ACTIVE",
          lastRunAt: new Date(),
          leadsFound: { increment: totalFound },
          enriched: { increment: enrichedIds.length + channelResults.serperProspectIds.length },
          sequences: { increment: sequenceCount },
        },
      });
    });

    return {
      personaId,
      leadsFound: totalFound,
      enriched: enrichedIds.length + channelResults.serperProspectIds.length,
      sequences: sequenceCount,
    };
  }
);
