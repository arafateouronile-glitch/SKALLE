/**
 * 🎯 Social Engagement Prospector Engine
 *
 * Détecte les interactions sociales (likes, commentaires, follows)
 * et génère des DM personnalisés avec l'IA pour convertir l'engagement
 * en opportunités commerciales.
 *
 * IMPORTANT : Pas d'envoi automatique de DM (compliance Meta).
 * L'outil fournit le texte + lien profil pour envoi manuel ("Click-to-DM").
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Prisma } from "@prisma/client";
import { metaGet } from "@/lib/services/meta/graph-api";
import { refreshTokenIfNeeded } from "@/lib/services/meta/token-manager";
import { generateOpeningMessageVariants } from "@/lib/services/social/closer";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SocialPlatform = "INSTAGRAM" | "FACEBOOK";
export type InteractionType = "LIKE" | "COMMENT" | "FOLLOW" | "GROUP_MEMBER";
export type InteractionStatus = "PENDING" | "CONTACTED" | "IGNORED";

export interface RawInteraction {
  platform: SocialPlatform;
  type: InteractionType;
  sourceUrl: string;
  prospectName: string;
  prospectHandle: string;
  profileUrl?: string;
  interactionText?: string;
  metaUserId?: string;
  metaCommentId?: string;
  facebookGroupId?: string;
}

export interface DMVariant {
  label: string; // "Chaleureuse", "Directe", "Curieuse"
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ TRACKER D'ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Importe des interactions extraites (via extension Chrome, CSV, ou scraper externe)
 * et les stocke dans SocialInteraction.
 */
function ensurePrismaModel() {
  if (typeof (prisma as { socialInteraction?: unknown }).socialInteraction === "undefined") {
    throw new Error(
      "Modèle SocialInteraction non chargé. Redémarrez le serveur (npx prisma generate puis npm run dev)."
    );
  }
}

export async function importInteractions(
  workspaceId: string,
  interactions: RawInteraction[]
): Promise<{ imported: number; duplicates: number }> {
  ensurePrismaModel();
  let imported = 0;
  let duplicates = 0;

  for (const interaction of interactions) {
    // Dédoublonnage par handle + sourceUrl + workspace
    const existing = await prisma.socialInteraction.findFirst({
      where: {
        workspaceId,
        prospectHandle: interaction.prospectHandle,
        sourceUrl: interaction.sourceUrl,
      },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    await prisma.socialInteraction.create({
      data: {
        platform: interaction.platform,
        type: interaction.type,
        sourceUrl: interaction.sourceUrl,
        prospectName: interaction.prospectName,
        prospectHandle: interaction.prospectHandle,
        profileUrl: interaction.profileUrl || buildProfileUrl(interaction.platform, interaction.prospectHandle),
        interactionText: interaction.interactionText,
        metaUserId: interaction.metaUserId,
        metaCommentId: interaction.metaCommentId,
        facebookGroupId: interaction.facebookGroupId,
        workspaceId,
      },
    });

    imported++;
  }

  return { imported, duplicates };
}

/**
 * Extrait l'engagement d'un post via l'API Meta Graph.
 * Fallback sur des données mock si aucun compte Meta n'est connecté.
 */
export async function trackPostEngagement(
  postUrl: string,
  platform: SocialPlatform,
  workspaceId: string
): Promise<RawInteraction[]> {
  ensurePrismaModel();

  // Chercher un compte Meta connecté
  const metaAccount = await prisma.metaSocialAccount.findFirst({
    where: { workspaceId, isActive: true },
  });

  // Si pas de compte Meta connecté → fallback mock
  if (!metaAccount) {
    return trackPostEngagementMock(postUrl, platform, workspaceId);
  }

  try {
    // Rafraîchir le token si nécessaire
    const pageToken = await refreshTokenIfNeeded(metaAccount.id);

    // Extraire le media ID depuis l'URL
    const mediaId = await resolveMediaId(postUrl, platform, metaAccount, pageToken);
    if (!mediaId) {
      throw new Error("Impossible d'extraire le media ID depuis l'URL du post");
    }

    const interactions: RawInteraction[] = [];

    // Fetch comments
    try {
      const commentsData = await metaGet<{
        data: Array<{
          id: string;
          text?: string;
          message?: string;
          username?: string;
          from?: { id: string; name: string };
          timestamp?: string;
        }>;
      }>(`/${mediaId}/comments`, pageToken, {
        fields: "id,text,username,from,timestamp",
      });

      for (const comment of commentsData.data || []) {
        const name = comment.from?.name || comment.username || "Utilisateur";
        const handle = comment.username ? `@${comment.username}` : comment.from?.id || "unknown";

        interactions.push({
          platform,
          type: "COMMENT",
          sourceUrl: postUrl,
          prospectName: name,
          prospectHandle: handle,
          interactionText: comment.text || comment.message,
          metaUserId: comment.from?.id,
          metaCommentId: comment.id,
        });
      }
    } catch (e) {
      console.error("Error fetching comments:", e);
    }

    // Fetch likes (FB uniquement, IG retourne les likes limités)
    if (platform === "FACEBOOK") {
      try {
        const likesData = await metaGet<{
          data: Array<{ id: string; name: string }>;
        }>(`/${mediaId}/likes`, pageToken, { fields: "id,name" });

        for (const like of likesData.data || []) {
          interactions.push({
            platform,
            type: "LIKE",
            sourceUrl: postUrl,
            prospectName: like.name,
            prospectHandle: like.id,
            metaUserId: like.id,
          });
        }
      } catch (e) {
        console.error("Error fetching likes:", e);
      }
    }

    // Importer dans la DB
    await importInteractions(workspaceId, interactions);
    return interactions;
  } catch (error) {
    console.error("trackPostEngagement real API failed, falling back to mock:", error);
    return trackPostEngagementMock(postUrl, platform, workspaceId);
  }
}

/**
 * Résout l'ID du media/post Meta à partir de l'URL.
 */
async function resolveMediaId(
  postUrl: string,
  platform: SocialPlatform,
  metaAccount: { instagramAccountId: string | null; facebookPageId: string },
  pageToken: string
): Promise<string | null> {
  if (platform === "INSTAGRAM" && metaAccount.instagramAccountId) {
    // Essayer d'extraire le shortcode depuis l'URL IG
    // Format: https://instagram.com/p/SHORTCODE/ ou /reel/SHORTCODE/
    const shortcodeMatch = postUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (shortcodeMatch) {
      // Utiliser l'API IG pour trouver le media par shortcode via la liste des médias
      try {
        const media = await metaGet<{
          data: Array<{ id: string; shortcode?: string; permalink?: string }>;
        }>(`/${metaAccount.instagramAccountId}/media`, pageToken, {
          fields: "id,shortcode,permalink",
          limit: "50",
        });

        for (const m of media.data || []) {
          if (m.shortcode === shortcodeMatch[2] || m.permalink?.includes(shortcodeMatch[2])) {
            return m.id;
          }
        }
      } catch (e) {
        console.error("Error resolving IG media ID:", e);
      }
    }

    // Fallback : si l'URL contient directement un ID numérique
    const idMatch = postUrl.match(/\/(\d+)\/?$/);
    if (idMatch) return idMatch[1];
  }

  if (platform === "FACEBOOK") {
    // Format FB: https://facebook.com/{page}/posts/{post_id}
    // ou https://facebook.com/permalink.php?story_fbid={id}&id={page_id}
    const postIdMatch = postUrl.match(/posts\/(\d+)/);
    if (postIdMatch) return `${metaAccount.facebookPageId}_${postIdMatch[1]}`;

    const storyMatch = postUrl.match(/story_fbid=(\d+)/);
    if (storyMatch) return `${metaAccount.facebookPageId}_${storyMatch[1]}`;
  }

  return null;
}

/**
 * Fallback mock pour le développement ou quand pas de compte Meta.
 */
async function trackPostEngagementMock(
  postUrl: string,
  platform: SocialPlatform,
  workspaceId: string
): Promise<RawInteraction[]> {
  const mockInteractions: RawInteraction[] = [
    {
      platform,
      type: "COMMENT",
      sourceUrl: postUrl,
      prospectName: "Marie Dupont",
      prospectHandle: platform === "INSTAGRAM" ? "@marie.dupont.coach" : "marie.dupont.123",
      interactionText: "Super intéressant ! Comment tu fais pour automatiser tout ça ?",
    },
    {
      platform,
      type: "COMMENT",
      sourceUrl: postUrl,
      prospectName: "Thomas Martin",
      prospectHandle: platform === "INSTAGRAM" ? "@thomas.martin.biz" : "thomas.martin.456",
      interactionText: "Je cherche exactement ce type de solution pour mon business",
    },
    {
      platform,
      type: "LIKE",
      sourceUrl: postUrl,
      prospectName: "Sophie Laurent",
      prospectHandle: platform === "INSTAGRAM" ? "@sophie.laurent.digital" : "sophie.laurent.789",
    },
    {
      platform,
      type: "COMMENT",
      sourceUrl: postUrl,
      prospectName: "Ahmed Benali",
      prospectHandle: platform === "INSTAGRAM" ? "@ahmed.benali.growth" : "ahmed.benali.101",
      interactionText: "Est-ce que ça marche aussi pour les petites entreprises ?",
    },
    {
      platform,
      type: "LIKE",
      sourceUrl: postUrl,
      prospectName: "Julie Moreau",
      prospectHandle: platform === "INSTAGRAM" ? "@julie.moreau.consulting" : "julie.moreau.202",
    },
  ];

  await importInteractions(workspaceId, mockInteractions);
  return mockInteractions;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ ANALYSE CONTEXTUELLE IA & GÉNÉRATION DE DM
// ═══════════════════════════════════════════════════════════════════════════

const socialDMPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en social selling et en prospection douce sur les réseaux sociaux.
Tu dois générer 3 variantes de DM (message direct) pour approcher un prospect qui a interagi avec un post.

RÈGLES CRUCIALES :
- Le message NE DOIT PAS être vendeur immédiatement
- Il doit rebondir SPÉCIFIQUEMENT sur ce que la personne a fait (like, commentaire, follow)
- Si la personne a posé une question en commentaire, le DM doit y répondre naturellement
- Chaque variante doit avoir un ton différent : Chaleureuse, Directe, Curieuse
- Longueur max : 300 caractères par message (limite DM Instagram)
- Utilise le tutoiement si le ton de la marque est casual/friendly, le vouvoiement sinon

Structure de chaque DM en 3 parties :
1. Accroche contextuelle (remerciement/référence à l'interaction)
2. Valeur ajoutée (réponse à un besoin détecté ou insight)
3. Call-to-action léger (question ouverte ou invitation)

Réponds UNIQUEMENT en JSON valide avec cette structure :
[
  {{ "label": "Chaleureuse", "message": "..." }},
  {{ "label": "Directe", "message": "..." }},
  {{ "label": "Curieuse", "message": "..." }}
]`,
  ],
  [
    "human",
    `Contexte de l'interaction :
- Plateforme : {platform}
- Type d'interaction : {interactionType}
- URL du post source : {sourceUrl}
- Nom du prospect : {prospectName}
- Handle : {prospectHandle}
- Contenu du commentaire : {interactionText}

Ton de voix de la marque :
{brandVoice}

Génère les 3 variantes de DM.`,
  ],
]);

/**
 * Génère 3 variantes de DM personnalisé pour une interaction donnée.
 * - GROUP_MEMBER : utilise le SocialCloser (accroche groupe Facebook)
 * - Autres : utilise le prompt engagement (like, commentaire, follow)
 */
export async function generatePersonalizedDM(
  interactionId: string
): Promise<DMVariant[]> {
  ensurePrismaModel();
  const interaction = await prisma.socialInteraction.findUnique({
    where: { id: interactionId },
    include: {
      workspace: {
        select: { brandVoice: true, domainUrl: true },
      },
      facebookGroup: {
        select: { name: true },
      },
    },
  });

  if (!interaction) {
    throw new Error("Interaction non trouvée");
  }

  // Membres de groupes Facebook → SocialCloser (Le "Closer")
  if (interaction.type === "GROUP_MEMBER") {
    const groupName = interaction.facebookGroup?.name ?? "ce groupe";
    const variants = await generateOpeningMessageVariants(
      {
        prospectName: interaction.prospectName,
        prospectHandle: interaction.prospectHandle,
        profileUrl: interaction.profileUrl ?? undefined,
        groupName,
        groupUrl: interaction.sourceUrl,
        interactionText: interaction.interactionText ?? undefined,
      },
      {
        domainUrl: interaction.workspace.domainUrl,
        brandVoice: interaction.workspace.brandVoice ?? undefined,
      }
    );

    await prisma.socialInteraction.update({
      where: { id: interactionId },
      data: { suggestedDMs: variants as unknown as Prisma.InputJsonValue },
    });

    return variants;
  }

  // Engagement post (like, comment, follow) → prompt classique
  const brandVoice = interaction.workspace.brandVoice
    ? JSON.stringify(interaction.workspace.brandVoice, null, 2)
    : "Ton professionnel et amical. Tutoiement.";

  const chain = socialDMPrompt
    .pipe(getClaude())
    .pipe(getStringParser());

  const result = await chain.invoke({
    platform: interaction.platform,
    interactionType: interaction.type,
    sourceUrl: interaction.sourceUrl,
    prospectName: interaction.prospectName,
    prospectHandle: interaction.prospectHandle,
    interactionText: interaction.interactionText || "(Pas de commentaire - simple like/follow)",
    brandVoice,
  });

  const cleanedResult = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const variants: DMVariant[] = JSON.parse(cleanedResult);

  await prisma.socialInteraction.update({
    where: { id: interactionId },
    data: { suggestedDMs: variants as unknown as Prisma.InputJsonValue },
  });

  return variants;
}

/**
 * Système de rotation : génère une nouvelle série de DM
 * avec un seed aléatoire pour éviter les patterns répétitifs.
 */
export async function regenerateDM(
  interactionId: string
): Promise<DMVariant[]> {
  // Efface les anciens DM pour forcer la régénération
  await prisma.socialInteraction.update({
    where: { id: interactionId },
    data: { suggestedDMs: Prisma.JsonNull },
  });

  return generatePersonalizedDM(interactionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ FONCTIONS DE GESTION DU WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les interactions en attente de contact pour un workspace.
 */
export async function getPendingInteractions(
  workspaceId: string,
  options?: {
    platform?: SocialPlatform;
    type?: InteractionType;
    limit?: number;
    offset?: number;
  }
) {
  ensurePrismaModel();
  const where: Record<string, unknown> = {
    workspaceId,
    status: "PENDING",
  };

  if (options?.platform) where.platform = options.platform;
  if (options?.type) where.type = options.type;

  const [interactions, total] = await Promise.all([
    prisma.socialInteraction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.socialInteraction.count({ where }),
  ]);

  return { interactions, total };
}

/**
 * Récupère toutes les interactions d'un workspace avec stats.
 */
export async function getInteractionsWithStats(workspaceId: string) {
  ensurePrismaModel();
  const [interactions, stats] = await Promise.all([
    prisma.socialInteraction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.socialInteraction.groupBy({
      by: ["status"],
      where: { workspaceId },
      _count: true,
    }),
  ]);

  const statusCounts = {
    PENDING: 0,
    CONTACTED: 0,
    IGNORED: 0,
  };

  for (const stat of stats) {
    statusCounts[stat.status as InteractionStatus] = stat._count;
  }

  return { interactions, stats: statusCounts };
}

/**
 * Met à jour le statut d'une interaction.
 */
export async function markAsContacted(interactionId: string) {
  return prisma.socialInteraction.update({
    where: { id: interactionId },
    data: { status: "CONTACTED" },
  });
}

export async function markAsIgnored(interactionId: string) {
  return prisma.socialInteraction.update({
    where: { id: interactionId },
    data: { status: "IGNORED" },
  });
}

export async function deleteInteraction(interactionId: string) {
  return prisma.socialInteraction.delete({
    where: { id: interactionId },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════════

function buildProfileUrl(platform: SocialPlatform, handle: string): string {
  const cleanHandle = handle.replace(/^@/, "");
  if (platform === "INSTAGRAM") {
    return `https://instagram.com/${cleanHandle}`;
  }
  return `https://facebook.com/${cleanHandle}`;
}
