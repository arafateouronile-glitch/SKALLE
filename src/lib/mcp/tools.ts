/**
 * MCP Tools — actions that external MCP clients can invoke on SKALLE.
 * These are the "write" or "trigger" operations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export function registerTools(server: McpServer, workspaceId: string) {
  // ── Create Prospect ────────────────────────────────────────────────────────
  server.tool(
    "create_prospect",
    "Crée un nouveau prospect dans le CRM SKALLE",
    {
      name: z.string().describe("Nom complet du prospect"),
      company: z.string().describe("Entreprise du prospect"),
      jobTitle: z.string().optional().describe("Poste/titre du prospect"),
      email: z.string().email().optional().describe("Email du prospect"),
      linkedInUrl: z.string().url().optional().describe("URL profil LinkedIn"),
      notes: z.string().optional().describe("Notes additionnelles"),
    },
    async ({ name, company, jobTitle, email, linkedInUrl, notes }) => {
      const prospect = await prisma.prospect.create({
        data: {
          workspaceId,
          name,
          company,
          jobTitle: jobTitle ?? null,
          email: email ?? null,
          linkedInUrl: linkedInUrl ?? "",
          notes: notes ?? null,
          status: "NEW",
        },
        select: { id: true, name: true, status: true },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, prospect }),
          },
        ],
      };
    }
  );

  // ── Search Prospects ───────────────────────────────────────────────────────
  server.tool(
    "search_prospects",
    "Recherche des prospects dans le CRM SKALLE",
    {
      query: z.string().describe("Terme de recherche (nom, société, email)"),
      status: z
        .enum([
          "NEW",
          "RESEARCHED",
          "MESSAGES_GENERATED",
          "CONTACTED",
          "RESPONDED",
          "MEETING_BOOKED",
          "CONVERTED",
        ])
        .optional()
        .describe("Filtrer par statut pipeline"),
      limit: z.number().int().min(1).max(50).default(10).describe("Nombre de résultats"),
    },
    async ({ query, status, limit }) => {
      const prospects = await prisma.prospect.findMany({
        where: {
          workspaceId,
          ...(status ? { status } : {}),
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { company: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          company: true,
          jobTitle: true,
          email: true,
          status: true,
          score: true,
        },
        take: limit,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: prospects.length, prospects }),
          },
        ],
      };
    }
  );

  // ── Schedule Post ──────────────────────────────────────────────────────────
  server.tool(
    "schedule_post",
    "Planifie un post sur les réseaux sociaux via SKALLE",
    {
      type: z
        .enum(["LINKEDIN", "X", "INSTAGRAM", "TIKTOK", "FACEBOOK"])
        .describe("Réseau social cible"),
      content: z.string().describe("Contenu du post"),
      scheduledAt: z
        .string()
        .describe("Date/heure de publication ISO 8601 (ex: 2025-01-15T09:00:00Z)"),
    },
    async ({ type, content, scheduledAt }) => {
      const post = await prisma.post.create({
        data: {
          workspaceId,
          type,
          content,
          status: "SCHEDULED",
          scheduledAt: new Date(scheduledAt),
        },
        select: { id: true, type: true, status: true, scheduledAt: true },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, post }),
          },
        ],
      };
    }
  );

  // ── Get Workspace Stats ────────────────────────────────────────────────────
  server.tool(
    "get_workspace_stats",
    "Récupère les statistiques clés du workspace SKALLE",
    {},
    async () => {
      const [prospectsCount, postsCount, keywordsCount, contentPlansCount] =
        await Promise.all([
          prisma.prospect.count({ where: { workspaceId } }),
          prisma.post.count({ where: { workspaceId } }),
          prisma.keywordResearch.count({ where: { workspaceId } }),
          prisma.contentPlan.count({ where: { workspaceId } }),
        ]);

      const prospectsbyStatus = await prisma.prospect.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: true,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              totals: { prospectsCount, postsCount, keywordsCount, contentPlansCount },
              prospectsByStatus: prospectsbyStatus.map((p) => ({
                status: p.status,
                count: p._count,
              })),
            }),
          },
        ],
      };
    }
  );

  // ── Update Prospect Status ─────────────────────────────────────────────────
  server.tool(
    "update_prospect_status",
    "Met à jour le statut pipeline d'un prospect",
    {
      prospectId: z.string().describe("ID du prospect"),
      status: z
        .enum([
          "NEW",
          "RESEARCHED",
          "MESSAGES_GENERATED",
          "CONTACTED",
          "RESPONDED",
          "MEETING_BOOKED",
          "CONVERTED",
        ])
        .describe("Nouveau statut"),
      notes: z.string().optional().describe("Notes de mise à jour"),
    },
    async ({ prospectId, status, notes }) => {
      const prospect = await prisma.prospect.updateMany({
        where: { id: prospectId, workspaceId },
        data: {
          status,
          ...(notes ? { notes } : {}),
          updatedAt: new Date(),
        },
      });
      if (prospect.count === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: "Prospect introuvable" }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, prospectId, newStatus: status }),
          },
        ],
      };
    }
  );
}
