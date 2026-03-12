"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WordPressClient, publishToWordPress } from "@/lib/cms/wordpress";
import { getWordPressConfig, getExternalIntegrationKey } from "@/lib/services/integrations/external";
import {
  publishToRestApi,
  publishToStrapi,
  publishToSanity,
  publishToContentful,
  type StrapiConfig,
  type SanityConfig,
  type ContentfulConfig,
  type RestApiConfig,
} from "@/lib/services/integrations/headless-cms";
import { z } from "zod";

const cmsConfigSchema = z.object({
  platform: z.enum(["WORDPRESS", "SHOPIFY"]),
  apiUrl: z.string().url(),
  apiKey: z.string().min(1),
  username: z.string().optional(),
});

export async function saveCMSConfig(
  workspaceId: string,
  data: z.infer<typeof cmsConfigSchema>
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const parsed = cmsConfigSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Configuration invalide" };
    }

    // Verify workspace ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Test connection first
    if (parsed.data.platform === "WORDPRESS") {
      const client = new WordPressClient(
        parsed.data.apiUrl,
        parsed.data.username || "admin",
        parsed.data.apiKey
      );
      const test = await client.testConnection();
      if (!test.success) {
        return { success: false, error: test.error };
      }
    }

    // Upsert CMS config
    await prisma.cMSConfig.upsert({
      where: { workspaceId },
      update: {
        platform: parsed.data.platform,
        apiUrl: parsed.data.apiUrl,
        apiKey: parsed.data.apiKey,
        username: parsed.data.username,
      },
      create: {
        platform: parsed.data.platform,
        apiUrl: parsed.data.apiUrl,
        apiKey: parsed.data.apiKey,
        username: parsed.data.username,
        workspaceId,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Save CMS config error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function getCMSConfig(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.cMSConfig.findFirst({
    where: {
      workspaceId,
      workspace: { userId: session.user.id },
    },
    select: {
      platform: true,
      apiUrl: true,
      username: true,
      // Don't return apiKey for security
    },
  });
}

export async function deleteCMSConfig(workspaceId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    await prisma.cMSConfig.delete({
      where: {
        workspaceId,
        workspace: { userId: session.user.id },
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Delete CMS config error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function publishPostToCMS(postId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    // Get post with workspace and CMS config
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { userId: session.user.id },
      },
      include: {
        workspace: {
          include: { cmsConfig: true },
        },
      },
    });

    if (!post) {
      return { success: false, error: "Article non trouvé" };
    }

    // Résoudre la config WordPress : ExternalIntegration (nouveau) en priorité, CMSConfig (ancien) en fallback
    let wpConfig: { apiUrl: string; username: string; apiKey: string } | null = null;

    const extWp = await getWordPressConfig(post.workspaceId);
    if (extWp) {
      wpConfig = {
        apiUrl: extWp.siteUrl,
        username: extWp.username,
        apiKey: extWp.applicationPassword,
      };
    } else if (post.workspace.cmsConfig?.platform === "WORDPRESS") {
      const cms = post.workspace.cmsConfig;
      wpConfig = { apiUrl: cms.apiUrl, username: cms.username || "admin", apiKey: cms.apiKey };
    }

    if (!wpConfig) {
      return {
        success: false,
        error: "WordPress non configuré. Connectez votre site dans Paramètres → Intégrations.",
      };
    }

    const articlePayload = {
      title: post.title || "Sans titre",
      content: post.content,
      excerpt: post.excerpt ?? undefined,
      imageUrl: post.imageUrl ?? undefined,
      metaTitle: post.metaTitle ?? undefined,
      metaDescription: post.metaDescription ?? undefined,
      keywords: post.keywords.length ? post.keywords : undefined,
    };

    // WordPress
    if (wpConfig) {
      const result = await publishToWordPress(wpConfig, { ...articlePayload, status: "draft" });
      if (!result.success) return { success: false, error: result.error };
      await prisma.post.update({
        where: { id: postId },
        data: { cmsPostId: result.postId?.toString(), publishedAt: new Date(), status: "PUBLISHED" },
      });
      return { success: true, link: result.link };
    }

    // Headless CMS : Strapi / Sanity / Contentful / REST_API
    const headlessProviders = ["STRAPI", "SANITY", "CONTENTFUL", "REST_API"] as const;
    for (const provider of headlessProviders) {
      const raw = await getExternalIntegrationKey(post.workspaceId, provider);
      if (!raw) continue;

      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { continue; }

      let result: { success: boolean; postId?: string; url?: string; error?: string };

      if (provider === "STRAPI") {
        result = await publishToStrapi(parsed as StrapiConfig, articlePayload);
      } else if (provider === "SANITY") {
        result = await publishToSanity(parsed as SanityConfig, articlePayload);
      } else if (provider === "CONTENTFUL") {
        result = await publishToContentful(parsed as ContentfulConfig, articlePayload);
      } else {
        result = await publishToRestApi(parsed as RestApiConfig, articlePayload);
      }

      if (!result.success) return { success: false, error: result.error };
      await prisma.post.update({
        where: { id: postId },
        data: { cmsPostId: result.url ?? result.postId, publishedAt: new Date(), status: "PUBLISHED" },
      });
      return { success: true, link: result.url };
    }

    return { success: false, error: "Aucun CMS configuré. Connectez WordPress, Strapi, Sanity, Contentful ou une API REST dans les intégrations." };
  } catch (error) {
    console.error("Publish to CMS error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}
