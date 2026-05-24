/**
 * Intent Signals Daily Cron — surveillance continue des signaux d'achat
 *
 * Tourne chaque jour à 8h pour tous les workspaces qui ont au moins
 * un LeadSearchCriteria actif (persona configuré).
 *
 * Pour chaque workspace :
 *   1. Scanne les entreprises des prospects existants (FUNDING/HIRING/EXPANSION/ACQUISITION)
 *   2. Scanne les nouvelles entreprises créées dans les secteurs du persona (NEW_COMPANY)
 *   3. Persiste les nouveaux signaux avec dédup 7 jours
 *
 * Résultat enrichi dans la foulée via Hunter.io si domaine disponible.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  scanWorkspaceSignals,
  scanNewCompaniesInSectors,
} from "@/lib/services/prospects/intent-scanner";

export const intentSignalsDailyCron = inngest.createFunction(
  {
    id: "intent-signals-daily",
    name: "Intent Signals — Scan quotidien",
    concurrency: { limit: 2 },
    retries: 1,
  },
  { cron: "0 8 * * *" }, // chaque jour à 8h
  async ({ step, logger }) => {
    // 1. Charger les workspaces avec un persona actif
    const workspaces = await step.run("load-active-workspaces", async () => {
      const criteria = await prisma.leadSearchCriteria.findMany({
        where: { isActive: true },
        select: { workspaceId: true, industries: true },
        distinct: ["workspaceId"],
      });
      return criteria.map((c) => ({ workspaceId: c.workspaceId, industries: c.industries }));
    });

    logger.info(`Intent signals scan — ${workspaces.length} workspaces actifs`);

    let totalSaved = 0;

    for (const ws of workspaces) {
      const saved = await step.run(`scan-workspace-${ws.workspaceId}`, async () => {
        // Prospects de ce workspace
        const prospects = await prisma.prospect.findMany({
          where: { workspaceId: ws.workspaceId },
          select: { id: true, company: true },
        });

        const seen = new Set<string>();
        const companies: Array<{ name: string; prospectId: string }> = [];
        for (const p of prospects) {
          const key = p.company.trim().toLowerCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            companies.push({ name: p.company.trim(), prospectId: p.id });
          }
        }

        const [companySignals, newCompanySignals] = await Promise.all([
          companies.length > 0 ? scanWorkspaceSignals(companies) : Promise.resolve([]),
          ws.industries.length > 0
            ? scanNewCompaniesInSectors(ws.industries)
            : Promise.resolve([]),
        ]);

        const allSignals = [
          ...companySignals,
          ...newCompanySignals.map((s) => ({ ...s, prospectId: undefined })),
        ];

        const cutoff = new Date(Date.now() - 7 * 86_400_000);
        let count = 0;

        for (const sig of allSignals) {
          const exists = await prisma.intentSignal.findFirst({
            where: {
              workspaceId: ws.workspaceId,
              companyName: sig.companyName,
              type: sig.type,
              title: sig.title,
              detectedAt: { gte: cutoff },
            },
            select: { id: true },
          });
          if (exists) continue;

          await prisma.intentSignal.create({
            data: {
              type: sig.type,
              companyName: sig.companyName,
              title: sig.title,
              description: sig.description,
              sourceUrl: sig.sourceUrl,
              score: sig.score,
              prospectId: sig.prospectId ?? null,
              workspaceId: ws.workspaceId,
            },
          });
          count++;
        }

        // Garder seulement les 200 signaux les plus récents par workspace
        const allIds = await prisma.intentSignal.findMany({
          where: { workspaceId: ws.workspaceId },
          orderBy: [{ score: "desc" }, { detectedAt: "desc" }],
          select: { id: true },
          skip: 200,
        });
        if (allIds.length > 0) {
          await prisma.intentSignal.deleteMany({
            where: { id: { in: allIds.map((r) => r.id) } },
          });
        }

        return count;
      });

      totalSaved += saved;
    }

    return { workspacesScanned: workspaces.length, signalsSaved: totalSaved };
  }
);

// Event déclenché manuellement depuis le dashboard
export const intentSignalsManual = inngest.createFunction(
  {
    id: "intent-signals-manual",
    name: "Intent Signals — Scan manuel",
    retries: 1,
  },
  { event: "intent-signals/scan" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    return step.run("scan", async () => {
      const [criteriaList, prospects] = await Promise.all([
        prisma.leadSearchCriteria.findMany({
          where: { workspaceId, isActive: true },
          select: { industries: true },
          take: 3,
        }),
        prisma.prospect.findMany({
          where: { workspaceId },
          select: { id: true, company: true },
        }),
      ]);

      const industries = [...new Set(criteriaList.flatMap((c) => c.industries).filter(Boolean))];

      const seen = new Set<string>();
      const companies: Array<{ name: string; prospectId: string }> = [];
      for (const p of prospects) {
        const key = p.company.trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          companies.push({ name: p.company.trim(), prospectId: p.id });
        }
      }

      const [companySignals, newCompanySignals] = await Promise.all([
        companies.length > 0 ? scanWorkspaceSignals(companies) : Promise.resolve([]),
        industries.length > 0 ? scanNewCompaniesInSectors(industries) : Promise.resolve([]),
      ]);

      const allSignals = [
        ...companySignals,
        ...newCompanySignals.map((s) => ({ ...s, prospectId: undefined })),
      ];

      const cutoff = new Date(Date.now() - 7 * 86_400_000);
      let saved = 0;

      for (const sig of allSignals) {
        const exists = await prisma.intentSignal.findFirst({
          where: {
            workspaceId,
            companyName: sig.companyName,
            type: sig.type,
            title: sig.title,
            detectedAt: { gte: cutoff },
          },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.intentSignal.create({
          data: {
            type: sig.type,
            companyName: sig.companyName,
            title: sig.title,
            description: sig.description,
            sourceUrl: sig.sourceUrl,
            score: sig.score,
            prospectId: sig.prospectId ?? null,
            workspaceId,
          },
        });
        saved++;
      }

      return { saved };
    });
  }
);
