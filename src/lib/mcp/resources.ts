/**
 * MCP Resources — expose SKALLE data as readable MCP resources.
 * External clients (Claude Desktop, Cursor, etc.) can read these.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerResources(server: McpServer, workspaceId: string) {
  // ── Prospects list ─────────────────────────────────────────────────────────
  server.registerResource(
    "prospects",
    `skalle://workspaces/${workspaceId}/prospects`,
    {
      description: "Liste des prospects du workspace avec leur statut pipeline",
      mimeType: "application/json",
    },
    async () => {
      const prospects = await prisma.prospect.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          company: true,
          jobTitle: true,
          email: true,
          linkedInUrl: true,
          status: true,
          score: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return {
        contents: [
          {
            uri: `skalle://workspaces/${workspaceId}/prospects`,
            mimeType: "application/json",
            text: JSON.stringify(prospects, null, 2),
          },
        ],
      };
    }
  );

  // ── SEO Keywords ───────────────────────────────────────────────────────────
  server.registerResource(
    "keywords",
    `skalle://workspaces/${workspaceId}/keywords`,
    {
      description: "Résultats des recherches de mots-clés SEO",
      mimeType: "application/json",
    },
    async () => {
      const researches = await prisma.keywordResearch.findMany({
        where: { workspaceId },
        select: {
          id: true,
          keyword: true,
          difficulty: true,
          relatedKeywords: true,
          searchIntent: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return {
        contents: [
          {
            uri: `skalle://workspaces/${workspaceId}/keywords`,
            mimeType: "application/json",
            text: JSON.stringify(researches, null, 2),
          },
        ],
      };
    }
  );

  // ── Social Posts ───────────────────────────────────────────────────────────
  server.registerResource(
    "posts",
    `skalle://workspaces/${workspaceId}/posts`,
    {
      description: "Posts planifiés et publiés sur les réseaux sociaux",
      mimeType: "application/json",
    },
    async () => {
      const posts = await prisma.post.findMany({
        where: { workspaceId },
        select: {
          id: true,
          type: true,
          content: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return {
        contents: [
          {
            uri: `skalle://workspaces/${workspaceId}/posts`,
            mimeType: "application/json",
            text: JSON.stringify(posts, null, 2),
          },
        ],
      };
    }
  );

  // ── Brand Voice ────────────────────────────────────────────────────────────
  server.registerResource(
    "brand-voice",
    `skalle://workspaces/${workspaceId}/brand-voice`,
    {
      description: "Stratégie de marque et persona marketing du workspace",
      mimeType: "application/json",
    },
    async () => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { brandVoice: true, brandType: true, name: true, domainUrl: true },
      });
      return {
        contents: [
          {
            uri: `skalle://workspaces/${workspaceId}/brand-voice`,
            mimeType: "application/json",
            text: JSON.stringify(workspace, null, 2),
          },
        ],
      };
    }
  );
}
