/**
 * 🤝 Partnership Engine — Channel Sales Module
 *
 * Moteur A : Social Influencer Radar (Instagram / TikTok / YouTube)
 *   → Mock Apify/Modash API + pitch IA personnalisé
 *
 * Moteur B : SEO Blog Affiliate Radar (via Serper.dev)
 *   → Google SERP top-10 sur un mot-clé + email IA personnalisé
 *
 * CRM : Sauvegarde des partenaires comme Prospects (source PARTNER_SOCIAL / PARTNER_SEO)
 */

import { searchGoogle } from "@/lib/ai/serper";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import prisma from "@/lib/prisma";
import { SourceType, type Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SocialPlatform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE";

export interface SocialPartner {
  username: string;
  platform: SocialPlatform;
  followersCount: number;
  engagementRate: number; // e.g. 3.5 → 3.5%
  bio: string;
  profileUrl: string;
  niche: string;
  pitch?: string;
}

export interface BlogPartner {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  position: number; // Google rank (1–10)
  keyword: string;
  pitch?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── Moteur A : Social Influencer Radar ──────────────────────────────────────

/**
 * Simule un appel Apify/Modash pour récupérer des influenceurs filtrés.
 * En production : remplacer par l'API Modash ou un Apify Actor.
 */
function mockInfluencerDatabase(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  platform: SocialPlatform
): SocialPartner[] {
  const nicheSlug = niche.toLowerCase().replace(/\s+/g, "_");

  const pool: SocialPartner[] = [
    {
      username: `${nicheSlug}_by_sarah`,
      platform,
      followersCount: Math.floor(minFollowers + Math.random() * (maxFollowers - minFollowers)),
      engagementRate: parseFloat((2.5 + Math.random() * 4).toFixed(1)),
      bio: `Passionnée de ${niche}. Je partage mes découvertes et outils préférés chaque semaine. Collab ? DM ouvert.`,
      profileUrl: `https://www.${platform.toLowerCase()}.com/${nicheSlug}_by_sarah`,
      niche,
    },
    {
      username: `${nicheSlug}expert_fr`,
      platform,
      followersCount: Math.floor(minFollowers + Math.random() * (maxFollowers - minFollowers)),
      engagementRate: parseFloat((1.8 + Math.random() * 3).toFixed(1)),
      bio: `Expert en ${niche} depuis 2019. Conseils pro, outils et stratégies. Auteur du blog ${nicheSlug}.fr`,
      profileUrl: `https://www.${platform.toLowerCase()}.com/${nicheSlug}expert_fr`,
      niche,
    },
    {
      username: `la_${nicheSlug}_academy`,
      platform,
      followersCount: Math.floor(minFollowers + Math.random() * (maxFollowers - minFollowers)),
      engagementRate: parseFloat((3.2 + Math.random() * 3.5).toFixed(1)),
      bio: `Formation ${niche} en ligne. Plus de 12 000 élèves formés. Affiliés bienvenus — programme 40%.`,
      profileUrl: `https://www.${platform.toLowerCase()}.com/la_${nicheSlug}_academy`,
      niche,
    },
    {
      username: `${nicheSlug}_hacks`,
      platform,
      followersCount: Math.floor(minFollowers + Math.random() * (maxFollowers - minFollowers)),
      engagementRate: parseFloat((4.0 + Math.random() * 2.5).toFixed(1)),
      bio: `Astuces ${niche} pour entrepreneurs. Je teste les outils à ta place. Partenariats : contact@${nicheSlug}hacks.fr`,
      profileUrl: `https://www.${platform.toLowerCase()}.com/${nicheSlug}_hacks`,
      niche,
    },
    {
      username: `${nicheSlug}_growth`,
      platform,
      followersCount: Math.floor(minFollowers + Math.random() * (maxFollowers - minFollowers)),
      engagementRate: parseFloat((2.0 + Math.random() * 2.8).toFixed(1)),
      bio: `Growth & ${niche}. Stratèges B2B. Podcast TOP 50 France. Open aux partnerships et affiliate deals.`,
      profileUrl: `https://www.${platform.toLowerCase()}.com/${nicheSlug}_growth`,
      niche,
    },
    {
      username: `be_${nicheSlug}`,
      platform,
      followersCount: Math.floor(minFollowers + Math.random() * (maxFollowers - minFollowers)),
      engagementRate: parseFloat((3.8 + Math.random() * 3.0).toFixed(1)),
      bio: `Vie de freelance & ${niche}. Communauté de +8k personnes. Je recommande seulement ce que j'utilise.`,
      profileUrl: `https://www.${platform.toLowerCase()}.com/be_${nicheSlug}`,
      niche,
    },
  ];

  return pool.filter(
    (p) => p.followersCount >= minFollowers && p.followersCount <= maxFollowers
  );
}

export async function findSocialPartners(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  platform: SocialPlatform
): Promise<SocialPartner[]> {
  return mockInfluencerDatabase(niche, minFollowers, maxFollowers, platform);
}

export async function generateInfluencerPitch(
  partner: SocialPartner
): Promise<string> {
  const claude = getClaude();
  const parser = getStringParser();

  const system = new SystemMessage(
    `Tu es un Partnership Manager expert en marketing d'affiliation et influence marketing.
Tu rédiges des DMs percutants, authentiques et courts (max 5 lignes) pour des influenceurs.
Tu dois : complimenter leur travail, proposer une collaboration d'affiliation, mentionner le % de commission.
Ton DM doit être naturel, jamais robotique. Utilise le prénom déduit du username si possible.
Réponds UNIQUEMENT avec le texte du DM, rien d'autre.`
  );

  const human = new HumanMessage(
    `Influenceur à contacter :
- Username : @${partner.username}
- Plateforme : ${partner.platform}
- Abonnés : ${partner.followersCount.toLocaleString("fr-FR")}
- Taux d'engagement : ${partner.engagementRate}%
- Bio : "${partner.bio}"
- Niche : ${partner.niche}

Rédige un DM pour proposer une collaboration d'affiliation à 30% de commission.`
  );

  const response = await claude.invoke([system, human]);
  return await parser.invoke(response);
}

// ─── Moteur B : SEO Blog Affiliate Radar ─────────────────────────────────────

export async function findBlogPartners(keyword: string): Promise<BlogPartner[]> {
  const results = await searchGoogle(keyword, 10);

  return results.map((r) => ({
    title: r.title,
    url: r.link,
    domain: extractDomain(r.link),
    snippet: r.snippet,
    position: r.position,
    keyword,
  }));
}

export async function generateBlogPitch(partner: BlogPartner): Promise<string> {
  const claude = getClaude();
  const parser = getStringParser();

  const system = new SystemMessage(
    `Tu es un Affiliate Manager B2B spécialisé dans les partenariats de contenu.
Tu rédiges des emails de prospection affiliés, courts (max 7 lignes), professionnels et personnalisés.
Tu dois : complimenter l'article de manière sincère, proposer d'y insérer notre outil avec un lien d'affiliation rémunérateur (30% commission récurrente).
Réponds UNIQUEMENT avec le corps de l'email (sans objet), rien d'autre.`
  );

  const human = new HumanMessage(
    `Blog à contacter :
- Titre de l'article : "${partner.title}"
- URL : ${partner.url}
- Domaine : ${partner.domain}
- Extrait Google : "${partner.snippet}"
- Position Google : #${partner.position} sur le mot-clé "${partner.keyword}"

Rédige un email pour proposer d'insérer notre outil Skalle (plateforme Sales & Marketing IA B2B) dans cet article avec un lien affilié à 30% de commission récurrente.`
  );

  const response = await claude.invoke([system, human]);
  return await parser.invoke(response);
}

// ─── CRM Integration ─────────────────────────────────────────────────────────

export interface PartnerCRMPayload {
  type: "social" | "seo";
  name: string;
  company: string;
  linkedInUrl: string; // URL du profil ou de l'article
  email?: string;
  source: SourceType;
  enrichmentData: Prisma.InputJsonValue;
  notes?: string;
}

export async function savePartnersToCRM(
  workspaceId: string,
  partners: PartnerCRMPayload[]
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  for (const partner of partners) {
    try {
      await prisma.prospect.upsert({
        where: {
          email_workspaceId: {
            email: partner.email ?? `noemail_${Date.now()}_${Math.random().toString(36).slice(2)}@placeholder.skalle`,
            workspaceId,
          },
        },
        create: {
          name: partner.name,
          company: partner.company,
          linkedInUrl: partner.linkedInUrl,
          email: partner.email,
          source: partner.source,
          enrichmentData: partner.enrichmentData,
          notes: partner.notes,
          workspaceId,
          status: "NEW",
          score: 0,
          sentiment: "NEUTRAL",
          temperature: "COLD",
        },
        update: {
          enrichmentData: partner.enrichmentData,
          notes: partner.notes,
        },
      });
      saved++;
    } catch {
      skipped++;
    }
  }

  return { saved, skipped };
}

// ─── Orchestrateur complet ────────────────────────────────────────────────────

export async function runSocialPartnerSearch(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  platform: SocialPlatform,
  workspaceId: string,
  saveToCRM: boolean = false
): Promise<SocialPartner[]> {
  const partners = await findSocialPartners(niche, minFollowers, maxFollowers, platform);

  // Générer les pitches IA en parallèle
  const withPitches = await Promise.all(
    partners.map(async (p) => ({
      ...p,
      pitch: await generateInfluencerPitch(p),
    }))
  );

  if (saveToCRM) {
    const payload: PartnerCRMPayload[] = withPitches.map((p) => ({
      type: "social" as const,
      name: `@${p.username}`,
      company: `${p.platform} Influencer`,
      linkedInUrl: p.profileUrl,
      source: SourceType.PARTNER_SOCIAL,
      enrichmentData: {
        platform: p.platform,
        followersCount: p.followersCount,
        engagementRate: p.engagementRate,
        bio: p.bio,
        niche: p.niche,
        pitch: p.pitch,
      },
      notes: p.pitch,
    }));

    await savePartnersToCRM(workspaceId, payload);
  }

  return withPitches;
}

export async function runBlogPartnerSearch(
  keyword: string,
  workspaceId: string,
  saveToCRM: boolean = false
): Promise<BlogPartner[]> {
  const partners = await findBlogPartners(keyword);

  // Générer les pitches IA en parallèle (max 5 pour économiser les crédits)
  const top5 = partners.slice(0, 5);
  const withPitches = await Promise.all(
    top5.map(async (p) => ({
      ...p,
      pitch: await generateBlogPitch(p),
    }))
  );

  // Compléter avec les autres sans pitch
  const rest = partners.slice(5).map((p) => ({ ...p, pitch: undefined }));
  const allPartners = [...withPitches, ...rest];

  if (saveToCRM) {
    const payload: PartnerCRMPayload[] = withPitches.map((p) => ({
      type: "seo" as const,
      name: p.title,
      company: p.domain,
      linkedInUrl: p.url,
      source: SourceType.PARTNER_SEO,
      enrichmentData: {
        url: p.url,
        domain: p.domain,
        snippet: p.snippet,
        googlePosition: p.position,
        keyword: p.keyword,
        pitch: p.pitch,
      },
      notes: p.pitch,
    }));

    await savePartnersToCRM(workspaceId, payload);
  }

  return allPartners;
}
