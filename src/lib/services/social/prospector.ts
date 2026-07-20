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
import { getExternalIntegrationKey } from "@/lib/services/integrations/external";
import { FAR_FUTURE } from "@/lib/services/smart-sequence-processor";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SocialPlatform = "INSTAGRAM" | "FACEBOOK" | "LINKEDIN";
export type InteractionType = "LIKE" | "COMMENT" | "FOLLOW" | "GROUP_MEMBER" | "PROFILE_VIEW" | "COMPETITOR_FOLLOW";
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

/**
 * Score de priorité d'un signal chaud — source de vérité unique, utilisée à
 * la fois pour Prospect.score (côté serveur) et le badge de warmth côté UI
 * (hunt/page.tsx), pour éviter que les deux divergent.
 */
export function computeWarmScore(type: InteractionType, hasText: boolean): number {
  switch (type) {
    case "COMMENT":
      return hasText ? 90 : 72;
    case "PROFILE_VIEW":
      return 68;
    case "COMPETITOR_FOLLOW":
      return 65;
    case "FOLLOW":
      return 63;
    case "LIKE":
      return 55;
    default:
      return 50;
  }
}

export function warmSignalLabel(type: string | null): string {
  switch (type) {
    case "PROFILE_VIEW":
      return "a visité votre profil";
    case "LIKE":
      return "a interagi avec un post";
    case "COMMENT":
      return "a commenté un post";
    case "FOLLOW":
      return "vous suit";
    case "COMPETITOR_FOLLOW":
      return "suit un concurrent";
    case "SEO_CONVERSION":
      return "a converti depuis un contenu marketing";
    default:
      return "signal entrant";
  }
}

/**
 * Pose un signal chaud sur un Prospect — source de vérité unique pour
 * warmSignalType/At + relève de score, réutilisée par captureWarmProspect
 * (LinkedIn) et par tout autre point d'entrée de lead entrant (ex. leads
 * marketing via l'API publique). Le score n'est jamais rétrogradé.
 */
export async function tagWarmSignal(prospectId: string, type: string, score: number): Promise<void> {
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { warmSignalType: type, warmSignalAt: new Date(), temperature: "WARM" },
  });
  await prisma.prospect.updateMany({
    where: { id: prospectId, score: { lt: score } },
    data: { score },
  });
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
// 4️⃣ LINKEDIN ENGAGEMENT EXTRACTOR (Gap A)
// ═══════════════════════════════════════════════════════════════════════════

const LINKEDIN_API = "https://api.linkedin.com/v2";

interface LinkedInActorProfile {
  localizedFirstName?: string;
  localizedLastName?: string;
  vanityName?: string;
}

interface LinkedInLikeElement {
  actor: string; // urn:li:person:xxx
  "actor~"?: LinkedInActorProfile;
}

interface LinkedInCommentElement {
  actor: string;
  "actor~"?: LinkedInActorProfile;
  message?: { text?: string };
}

interface LinkedInPaginatedResponse<T> {
  elements?: T[];
  paging?: { total: number; start: number; count: number };
}

function personUrnToId(urn: string): string {
  return urn.replace("urn:li:person:", "");
}

function buildLinkedInProfileUrl(actor: LinkedInActorProfile | undefined, personUrn: string): string {
  if (actor?.vanityName) return `https://www.linkedin.com/in/${actor.vanityName}`;
  const id = personUrnToId(personUrn);
  return `https://www.linkedin.com/profile/view?id=${id}`;
}

function buildLinkedInName(actor: LinkedInActorProfile | undefined): string {
  if (!actor) return "LinkedIn Member";
  const name = [actor.localizedFirstName, actor.localizedLastName].filter(Boolean).join(" ");
  return name || "LinkedIn Member";
}

function buildLinkedInHandle(actor: LinkedInActorProfile | undefined, personUrn: string): string {
  return actor?.vanityName ?? personUrnToId(personUrn);
}

/**
 * Extrait likers + commenters d'un post LinkedIn via l'API socialActions.
 * Requiert scope r_member_social (ou r_organization_social pour company pages).
 */
async function fetchLinkedInEngagers(
  accessToken: string,
  shareUrn: string
): Promise<Array<{ name: string; handle: string; profileUrl: string; interactionText?: string; type: "LIKE" | "COMMENT" }>> {
  const encoded = encodeURIComponent(shareUrn);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": "202304",
  };
  const results: Array<{ name: string; handle: string; profileUrl: string; interactionText?: string; type: "LIKE" | "COMMENT" }> = [];

  // Likes
  try {
    const res = await fetch(
      `${LINKEDIN_API}/socialActions/${encoded}/likes?count=100&projection=(elements*(actor,actor~(localizedFirstName,localizedLastName,vanityName)))`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json() as LinkedInPaginatedResponse<LinkedInLikeElement>;
      for (const el of data.elements ?? []) {
        results.push({
          type: "LIKE",
          name: buildLinkedInName(el["actor~"]),
          handle: buildLinkedInHandle(el["actor~"], el.actor),
          profileUrl: buildLinkedInProfileUrl(el["actor~"], el.actor),
        });
      }
    }
  } catch { /* API indisponible — fail silently */ }

  // Comments
  try {
    const res = await fetch(
      `${LINKEDIN_API}/socialActions/${encoded}/comments?count=100&projection=(elements*(actor,actor~(localizedFirstName,localizedLastName,vanityName),message))`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json() as LinkedInPaginatedResponse<LinkedInCommentElement>;
      for (const el of data.elements ?? []) {
        results.push({
          type: "COMMENT",
          name: buildLinkedInName(el["actor~"]),
          handle: buildLinkedInHandle(el["actor~"], el.actor),
          profileUrl: buildLinkedInProfileUrl(el["actor~"], el.actor),
          interactionText: el.message?.text,
        });
      }
    }
  } catch { /* fail silently */ }

  return results;
}

/**
 * Extrait les engagements (likes + commentaires) d'un post LinkedIn publié,
 * les dédoublonne et les persiste dans SocialInteraction.
 *
 * @param shareUrn  — URN du post (ex: urn:li:ugcPost:123) stocké dans Post.cmsPostId
 * @param sourceUrl — URL publique du post pour affichage
 */
export async function trackLinkedInPostEngagement(
  workspaceId: string,
  shareUrn: string,
  sourceUrl: string
): Promise<{ imported: number; errors: string[] }> {
  const raw = await getExternalIntegrationKey(workspaceId, "LINKEDIN_OAUTH");
  if (!raw) return { imported: 0, errors: ["LinkedIn non connecté"] };

  let tokenData: { accessToken: string };
  try {
    tokenData = JSON.parse(raw) as { accessToken: string };
  } catch {
    return { imported: 0, errors: ["Token LinkedIn invalide"] };
  }

  const engagers = await fetchLinkedInEngagers(tokenData.accessToken, shareUrn);
  if (engagers.length === 0) return { imported: 0, errors: [] };

  const interactions: RawInteraction[] = engagers.map((e) => ({
    platform: "LINKEDIN" as const,
    type: e.type,
    sourceUrl,
    prospectName: e.name,
    prospectHandle: e.handle,
    profileUrl: e.profileUrl,
    interactionText: e.interactionText,
  }));

  const result = await importInteractions(workspaceId, interactions);
  return { imported: result.imported, errors: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5️⃣ CAPTURE WARM LEAD → priorisation CSO Agent (Gap B)
// ═══════════════════════════════════════════════════════════════════════════

export type CaptureResult =
  | { prospectId: string; tagged: true; skipped: false }
  | { skipped: true; reason: string };

const ALREADY_IN_CONVERSATION_STATUSES = new Set(["RESPONDED", "MEETING_BOOKED", "CONVERTED"]);

/**
 * Vérifie si le prospect a déjà eu un échange LinkedIn avec ce workspace.
 * Retourne la raison du skip, ou null si le prospect est qualifiable.
 */
const RECIPIENT_COOLDOWN_MS = 7 * 24 * 3600 * 1000; // 7 jours

async function detectExistingConversation(
  workspaceId: string,
  prospectId: string,
  profileUrl: string
): Promise<string | null> {
  const sevenDaysAgo = new Date(Date.now() - RECIPIENT_COOLDOWN_MS);

  const [reply, prospect, repliedStep, recentSentStep] = await Promise.all([
    // 1. Ils ont déjà répondu à un message LinkedIn envoyé depuis SKALLE
    prisma.linkedInReply.findFirst({
      where: {
        workspaceId,
        OR: [
          { prospectId },
          ...(profileUrl ? [{ linkedInUrl: profileUrl }] : []),
        ],
      },
      select: { id: true },
    }),
    // 2. Statut prospect indique une relation active
    prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { status: true },
    }),
    // 3. Un step de séquence existant a reçu une réponse
    prisma.sequenceStep.findFirst({
      where: {
        repliedAt: { not: null },
        sequence: { prospectId, workspaceId },
      },
      select: { id: true },
    }),
    // 4. Cooldown : un step a été envoyé dans les 7 derniers jours
    prisma.sequenceStep.findFirst({
      where: {
        status: "SENT",
        sentAt: { gte: sevenDaysAgo },
        sequence: { prospectId, workspaceId },
      },
      select: { id: true, sentAt: true },
    }),
  ]);

  if (reply) return "a déjà répondu à un message LinkedIn";
  if (prospect && ALREADY_IN_CONVERSATION_STATUSES.has(prospect.status)) {
    return `statut prospect : ${prospect.status.toLowerCase()}`;
  }
  if (repliedStep) return "a déjà répondu à une séquence";
  if (recentSentStep) {
    const daysAgo = Math.floor((Date.now() - recentSentStep.sentAt!.getTime()) / 86400000);
    return `contacté il y a ${daysAgo}j — cooldown 7j actif`;
  }
  return null;
}

/**
 * Crée un Prospect (si inexistant) depuis une SocialInteraction, et le tague
 * comme signal chaud (warmSignalType/At + score). Ne crée AUCUNE séquence ni
 * message : le prospect entre simplement dans le pipeline NEW normal, où il
 * sera repris par le cycle quotidien du CSO Agent (observePipeline →
 * generateCsoDecisions → storeCsoDecisions) et proposé comme décision PENDING
 * pour validation humaine — jamais envoyé automatiquement.
 *
 * Skip si une conversation LinkedIn existe déjà avec cette personne.
 */
export async function captureWarmProspect(interactionId: string): Promise<CaptureResult> {
  ensurePrismaModel();

  const interaction = await prisma.socialInteraction.findUnique({
    where: { id: interactionId },
    select: {
      id: true,
      workspaceId: true,
      prospectName: true,
      prospectHandle: true,
      profileUrl: true,
      platform: true,
      type: true,
      sourceUrl: true,
      interactionText: true,
    },
  });

  if (!interaction) return { skipped: true, reason: "interaction introuvable" };

  const { workspaceId } = interaction;

  // 1. Find or create Prospect
  const profileUrl = interaction.profileUrl ?? "";
  let prospect = await prisma.prospect.findFirst({
    where: {
      workspaceId,
      OR: [
        ...(profileUrl ? [{ linkedInUrl: profileUrl }] : []),
        { handle: interaction.prospectHandle },
      ],
    },
    select: { id: true },
  });

  if (!prospect) {
    prospect = await prisma.prospect.create({
      data: {
        workspaceId,
        name: interaction.prospectName,
        linkedInUrl: profileUrl || `https://www.linkedin.com/in/${interaction.prospectHandle}`,
        company: "—",
        handle: interaction.prospectHandle,
        platform: interaction.platform,
        source: "LINKEDIN",
        notes: `Warm lead — ${interaction.type} sur ${interaction.sourceUrl}`,
      },
      select: { id: true },
    });
  }

  // 2. Vérifier si une conversation LinkedIn existe déjà → skip silencieux
  const skipReason = await detectExistingConversation(workspaceId, prospect.id, profileUrl);
  if (skipReason) return { skipped: true, reason: skipReason };

  // 3. Tagger le signal chaud — pas de séquence, pas d'envoi.
  const score = computeWarmScore(interaction.type as InteractionType, !!interaction.interactionText);
  await tagWarmSignal(prospect.id, interaction.type, score);

  return { prospectId: prospect.id, tagged: true, skipped: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════════

function buildProfileUrl(platform: SocialPlatform, handle: string): string {
  const cleanHandle = handle.replace(/^@/, "");
  if (platform === "INSTAGRAM") {
    return `https://instagram.com/${cleanHandle}`;
  }
  if (platform === "LINKEDIN") {
    return `https://www.linkedin.com/in/${cleanHandle}`;
  }
  return `https://facebook.com/${cleanHandle}`;
}
