"use server";

import { prisma } from "@/lib/prisma";

/**
 * Chiffres réels pour la section "Build in Public" de la landing.
 */
export async function getLandingStats(): Promise<{
  articlesGenerated: number;
  opportunitiesThisWeek: number;
}> {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [articlesGenerated, opportunitiesThisWeek] = await Promise.all([
      prisma.post.count({
        where: { status: "PUBLISHED", type: "SEO_ARTICLE" },
      }),
      prisma.prospect.count({
        where: {
          status: { in: ["CONTACTED", "REPLIED", "CONVERTED"] },
          updatedAt: { gte: weekAgo },
        },
      }),
    ]);

    return { articlesGenerated, opportunitiesThisWeek };
  } catch {
    return { articlesGenerated: 0, opportunitiesThisWeek: 0 };
  }
}
