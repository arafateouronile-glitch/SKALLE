"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WordPressClient, publishToWordPress } from "@/lib/cms/wordpress";
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

    if (!post.workspace.cmsConfig) {
      return { success: false, error: "CMS non configuré" };
    }

    const cmsConfig = post.workspace.cmsConfig;

    if (cmsConfig.platform === "WORDPRESS") {
      const result = await publishToWordPress(
        {
          apiUrl: cmsConfig.apiUrl,
          username: cmsConfig.username || "admin",
          apiKey: cmsConfig.apiKey,
        },
        {
          title: post.title || "Sans titre",
          content: post.content,
          excerpt: post.excerpt || undefined,
          imageUrl: post.imageUrl || undefined,
          status: "draft",
        }
      );

      if (result.success) {
        // Update post with CMS post ID
        await prisma.post.update({
          where: { id: postId },
          data: {
            cmsPostId: result.postId?.toString(),
            publishedAt: new Date(),
            status: "PUBLISHED",
          },
        });

        return { success: true, link: result.link };
      } else {
        return { success: false, error: result.error };
      }
    }

    return { success: false, error: "Plateforme non supportée" };
  } catch (error) {
    console.error("Publish to CMS error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}
