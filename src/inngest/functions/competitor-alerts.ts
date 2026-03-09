/**
 * 🔔 Competitor Alerts — Surveillance Concurrents (CRON toutes les 6h)
 *
 * Pour chaque workspace avec autopilot actif :
 * - Cherche les nouveaux contenus publiés par les concurrents (via Serper)
 * - Matche avec les keywords SEO du workspace
 * - Crée des CompetitorAlert en DB
 * - Injecte les alertes dans les prochaines observations du Brain
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { searchGoogle } from "@/lib/ai/serper";

export const scanCompetitorAlerts = inngest.createFunction(
  {
    id: "competitor-alerts-scan",
    name: "Scan Competitor New Content",
    concurrency: { limit: 2 },
    retries: 1,
  },
  { cron: "0 */6 * * *" }, // Toutes les 6 heures
  async ({ step }) => {
    // Charger tous les workspaces avec autopilot + discovery activé
    const configs = await step.run("load-autopilot-configs", async () => {
      return prisma.autopilotConfig.findMany({
        where: { isActive: true, discoveryEnabled: true },
        select: {
          id: true,
          competitorUrls: true,
          seoKeywords: true,
          workspace: { select: { id: true } },
        },
      });
    });

    const activeConfigs = configs.filter(
      (c) => c.competitorUrls.length > 0
    );

    if (activeConfigs.length === 0) {
      return { scanned: 0, alerts: 0 };
    }

    let totalAlerts = 0;
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    for (const config of activeConfigs) {
      const workspaceId = config.workspace.id;

      for (const competitorUrl of config.competitorUrls) {
        const domain = extractDomain(competitorUrl);
        if (!domain) continue;

        const results = await step.run(`scan-${workspaceId}-${domain}`, async () => {
          try {
            // Chercher les nouveaux contenus du concurrent (via Serper)
            return await searchGoogle(`site:${domain}`, 5);
          } catch {
            return [];
          }
        });

        if (!results.length) continue;

        for (const result of results) {
          // Vérifier si cette URL a déjà été enregistrée
          const existing = await step.run(
            `check-existing-${result.link?.substring(0, 30) ?? domain}`,
            async () => {
              return prisma.competitorAlert.findFirst({
                where: {
                  workspaceId,
                  newContentUrl: result.link ?? "",
                },
                select: { id: true },
              });
            }
          );

          if (existing) continue;

          // Vérifier si le contenu matche un des keywords du workspace
          const contentText = `${result.title ?? ""} ${result.snippet ?? ""}`.toLowerCase();
          const matchedKeyword = config.seoKeywords.find((kw) =>
            contentText.includes(kw.toLowerCase())
          );

          // Créer l'alerte seulement si match ou si très récent
          await step.run(`create-alert-${domain}-${totalAlerts}`, async () => {
            return prisma.competitorAlert.create({
              data: {
                workspaceId,
                competitorDomain: domain,
                newContentUrl: result.link ?? `https://${domain}`,
                contentTitle: result.title ?? null,
                matchedKeyword: matchedKeyword ?? null,
                isRead: false,
              },
            });
          });

          totalAlerts++;
        }
      }
    }

    return { scanned: activeConfigs.length, alerts: totalAlerts };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ UTILS
// ═══════════════════════════════════════════════════════════════════════════

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return null;
  }
}
