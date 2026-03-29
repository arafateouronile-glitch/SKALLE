/**
 * 🏭 Social Content Factory - Moteur de production de contenu data-driven
 *
 * Génère automatiquement 30 concepts de posts/mois en mixant :
 * - 40% Éducation (basé sur les mots-clés SEO)
 * - 30% Conversion (basé sur les structures Ads performantes)
 * - 30% Notoriété/Vision (basé sur la vision de l'utilisateur)
 *
 * Produit du contenu multi-format : LinkedIn, X, Instagram, TikTok
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getOpenAI, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { analyzeUserSite, type UserSiteAnalysis } from "@/lib/seo/discovery";
import type { BrandType, PostType } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketingPersona {
  brandColors: string[];
  services: string[];
  tone: string;
  targetAudience: string;
  uniqueValueProp: string;
  contentPillars: string[];
  competitiveAdvantages: string[];
}

export const ALL_NETWORKS = ["LINKEDIN", "X", "INSTAGRAM", "TIKTOK", "FACEBOOK"] as const;
export type SocialNetwork = typeof ALL_NETWORKS[number];

export interface StrategyInput {
  vision: string;
  niche: string;
  objectives: string[];
  networks: string[];
  workspaceId: string;
}

export type ConceptCategory = "education" | "conversion" | "awareness";

export interface ContentConcept {
  index: number;
  category: ConceptCategory;
  title: string;
  angle: string;
  sourceKeyword?: string;
  sourceAdId?: string;
  rationale: string;
  targetNetworks: PostType[];
}

export interface GeneratedPostSet {
  conceptIndex: number;
  linkedin?: string;
  xThread?: string;
  instagramCaption?: string;
  instagramImagePrompt?: string;
  tiktokScript?: string;
  facebookPost?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAND TYPE CONTEXT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getBrandTypeContext(brandType: BrandType): {
  personaInstructions: string;
  conceptInstructions: string;
  postToneInstructions: string;
  conceptDistribution: string;
} {
  switch (brandType) {
    case "PERSONAL_BRAND":
      return {
        personaInstructions:
          "Il s'agit d'une personal brand. Mets en avant l'expertise personnelle, le parcours, la personnalité unique et le thought leadership de l'individu. La proposition de valeur doit être centrée sur la personne, pas sur une entreprise.",
        conceptInstructions:
          "Pour une personal brand : privilégie les posts d'opinion (point de vue tranché), les récits personnels (storytelling), les leçons tirées d'expériences vécues, et les prises de position sur des sujets de ta niche. Le 'je' est naturel et authentique.",
        conceptDistribution:
          "RÉPARTITION POUR PERSONAL BRAND :\n- 10 concepts \"education\" (33%) : expertise partagée, tutoriels, frameworks personnels\n- 8 concepts \"awareness\" (27%) : storytelling personnel, parcours, behind-the-scenes\n- 7 concepts \"conversion\" (23%) : offres, services, résultats clients\n- 5 concepts \"engagement\" (17%) : opinions, sondages, questions à la communauté",
        postToneInstructions:
          "Ton: authentique, première personne (je), direct et sans jargon corporate. L'auteur parle en son nom. Partage d'expériences personnelles bienvenu.",
      };
    case "B2B":
      return {
        personaInstructions:
          "Il s'agit d'une entreprise B2B. Mets en avant la valeur métier, le ROI, les cas clients, et les problématiques des décideurs (C-level, managers). Le ton doit être professionnel et orienté résultats.",
        conceptInstructions:
          "Pour un contexte B2B : priorise les études de cas, les données chiffrées, les insights sectoriels, les solutions à des pain points métier précis, et les contenus orientés ROI. Cible les décideurs et influenceurs d'achat.",
        conceptDistribution:
          "RÉPARTITION POUR B2B :\n- 13 concepts \"education\" (43%) : guides pratiques, études de cas, benchmarks, best practices\n- 10 concepts \"conversion\" (33%) : démonstrations de valeur, ROI, témoignages clients, offres\n- 7 concepts \"awareness\" (24%) : vision du marché, tendances sectorielles, positionnement expert",
        postToneInstructions:
          "Ton: professionnel, orienté résultats et ROI, avec données et chiffres. Cible les décideurs. Évite le trop casual. LinkedIn est le réseau prioritaire.",
      };
    case "B2C":
    default:
      return {
        personaInstructions:
          "Il s'agit d'une marque B2C. Mets en avant les bénéfices consommateur, les émotions, le style de vie et la communauté. Le ton doit être accessible, chaleureux et inspirant.",
        conceptInstructions:
          "Pour un contexte B2C : privilégie les contenus lifestyle, les témoignages clients, les tutoriels d'utilisation, les tendances, et les contenus émotionnels qui créent un sentiment d'appartenance à la marque.",
        conceptDistribution:
          "RÉPARTITION POUR B2C :\n- 12 concepts \"education\" (40%) : tutoriels, conseils, guides d'utilisation\n- 9 concepts \"conversion\" (30%) : offres, produits, promotions, témoignages\n- 9 concepts \"awareness\" (30%) : lifestyle, valeurs de marque, communauté, tendances",
        postToneInstructions:
          "Ton: chaleureux, accessible, orienté émotions et bénéfices consommateurs. Instagram et TikTok sont prioritaires. Storytelling visuel et lifestyle.",
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. BRAND STRATEGY INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scrape le site du workspace, combine avec le brandVoice existant,
 * et construit une MarketingPersona stockée dans workspace.brandVoice.marketingPersona
 */
export async function initializeBrandStrategy(
  workspaceId: string
): Promise<{ success: boolean; persona?: MarketingPersona; error?: string }> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { domainUrl: true, brandVoice: true, brandType: true },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Scraper le site utilisateur (optionnel — on continue même sans domainUrl)
    let siteAnalysis: UserSiteAnalysis | null = null;
    if (workspace.domainUrl) {
      try {
        siteAnalysis = await analyzeUserSite(workspace.domainUrl);
      } catch (e) {
        console.warn("[Content Factory] Échec du scraping du site:", e);
      }
    }

    const existingBrandVoice = (workspace.brandVoice as Record<string, unknown>) ?? {};
    const brandTypeCtx = getBrandTypeContext(workspace.brandType ?? "B2C");

    // Construire les messages pour générer la persona
    const personaMessages = [
      new SystemMessage(
        `Tu es un expert en stratégie marketing et branding. À partir des données fournies sur un site web et sa marque, génère une "Marketing Persona" complète au format JSON.\n\n${brandTypeCtx.personaInstructions}\n\nLe JSON doit contenir exactement ces champs:\n- brandColors: array de 3-5 couleurs hex identifiées ou suggérées\n- services: array des services/produits clés identifiés\n- tone: le ton de communication (ex: "professionnel et inspirant", "technique et expert")\n- targetAudience: description de l'audience cible en 1-2 phrases\n- uniqueValueProp: proposition de valeur unique en 1 phrase\n- contentPillars: array de 3-5 piliers de contenu récurrents\n- competitiveAdvantages: array de 3-5 avantages concurrentiels\n\nRéponds UNIQUEMENT avec le JSON valide, sans markdown ni explication.`
      ),
      new HumanMessage(
        `Données du site web:\nURL: ${workspace.domainUrl}\nTitre: ${siteAnalysis?.title ?? "Non disponible"}\nDescription: ${siteAnalysis?.metaDescription ?? "Non disponible"}\nThème principal: ${siteAnalysis?.theme ?? "Non disponible"}\nMots-clés d'intention: ${siteAnalysis?.intentKeywords?.join(", ") ?? "Non disponible"}\nContenu principal (extrait): ${siteAnalysis?.mainContent?.slice(0, 2000) ?? "Non disponible"}\n\nBrand Voice existant:\n${JSON.stringify(existingBrandVoice, null, 2)}`
      ),
    ];

    const claude = getClaude();
    const parser = getStringParser();
    const result = await parser.invoke(await claude.invoke(personaMessages));

    // Parser le JSON
    const cleanJson = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const persona: MarketingPersona = JSON.parse(cleanJson);

    // Stocker dans le workspace
    const updatedBrandVoice = {
      ...existingBrandVoice,
      marketingPersona: persona,
    };
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        brandVoice: JSON.parse(JSON.stringify(updatedBrandVoice)),
      },
    });

    return { success: true, persona };
  } catch (error) {
    console.error("[Content Factory] Erreur initializeBrandStrategy:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONTENT CONCEPTS GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère 30 concepts de posts en utilisant les données SEO + Ads + Vision
 * Mix: 40% Éducation, 30% Conversion, 30% Notoriété
 */
export async function generateContentConcepts(
  workspaceId: string,
  input: StrategyInput
): Promise<{ success: boolean; concepts?: ContentConcept[]; error?: string }> {
  try {
    // 1. Pull top 20 keywords depuis KeywordResearch
    const keywords = await prisma.keywordResearch.findMany({
      where: { workspaceId },
      orderBy: [{ volume: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        keyword: true,
        volume: true,
        difficulty: true,
        searchIntent: true,
        paaQuestions: true,
      },
    });

    // 2. Pull quickWins depuis le dernier SEOAudit
    const latestAudit = await prisma.sEOAudit.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { actionPlan: true, targetKeywords: true },
    });

    const actionPlan = latestAudit?.actionPlan as Record<string, unknown> | null;
    const quickWins = (actionPlan?.quickWins as Array<Record<string, unknown>>) ?? [];

    // 3. Pull top-performing ads (efficiencyScore >= 60)
    const topAds = await prisma.scrapedAd.findMany({
      where: { workspaceId, efficiencyScore: { gte: 60 } },
      orderBy: { efficiencyScore: "desc" },
      take: 15,
      select: {
        id: true,
        adContent: true,
        hook: true,
        framework: true,
        advertiserName: true,
        efficiencyScore: true,
        platform: true,
      },
    });

    // 4. Récupérer la persona et le brandType
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { brandVoice: true, brandType: true },
    });
    const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};
    const persona = brandVoice.marketingPersona as MarketingPersona | undefined;
    const brandTypeCtx = getBrandTypeContext(workspace?.brandType ?? "B2C");

    // 5. Construire les messages de génération de concepts
    const keywordsContext = keywords.length > 0
      ? keywords.map((k) => `- "${k.keyword}" (volume: ${k.volume ?? "N/A"}, difficulté: ${k.difficulty}, intent: ${k.searchIntent ?? "N/A"})`).join("\n")
      : "Aucun mot-clé SEO disponible";

    const quickWinsContext = quickWins.length > 0
      ? quickWins.slice(0, 10).map((qw) => `- "${qw.keyword}" (opportunité: ${qw.opportunity})`).join("\n")
      : "Aucun quick win disponible";

    const adsContext = topAds.length > 0
      ? topAds.map((ad) => `- [${ad.id}] "${ad.hook ?? "N/A"}" (framework: ${ad.framework ?? "N/A"}, score: ${ad.efficiencyScore}, annonceur: ${ad.advertiserName})`).join("\n")
      : "Aucune publicité performante disponible";

    const paaQuestions = keywords
      .flatMap((k) => k.paaQuestions)
      .filter(Boolean)
      .slice(0, 15);

    const allowedNetworks = input.networks.length > 0 ? input.networks : [...ALL_NETWORKS];
    const networksInstruction = `RÉSEAUX AUTORISÉS : ${allowedNetworks.join(", ")} — n'utilise QUE ces réseaux dans "targetNetworks".`;

    const conceptMessages = [
      new SystemMessage(
        `Tu es un stratège de contenu social media expert. Tu dois générer exactement 30 concepts de posts pour un mois complet.\n\n${brandTypeCtx.conceptDistribution}\n\n${brandTypeCtx.conceptInstructions}\n\nRÈGLES :\n- Chaque concept doit avoir un angle unique et un titre accrocheur\n- Les concepts "education" doivent utiliser un mot-clé source (sourceKeyword)\n- Les concepts "conversion" doivent référencer un ad ID source (sourceAdId) quand disponible\n- Les concepts "awareness" sont basés sur le storytelling et la vision\n- ${networksInstruction}\n- Le "rationale" explique POURQUOI ce post est stratégique\n\nRéponds UNIQUEMENT avec un JSON valide: un array de 30 objets avec ces champs:\n[\n  {\n    "index": number (0-29),\n    "category": "education" | "conversion" | "awareness",\n    "title": string,\n    "angle": string,\n    "sourceKeyword": string | null,\n    "sourceAdId": string | null,\n    "rationale": string,\n    "targetNetworks": array of ${allowedNetworks.map(n => `"${n}"`).join("|")}\n  }\n]`
      ),
      new HumanMessage(
        `CONTEXTE DE LA MARQUE :\nVision: ${input.vision}\nNiche: ${input.niche}\nObjectifs: ${input.objectives.join(", ")}\nRéseaux cibles: ${allowedNetworks.join(", ")}\nPersona: ${persona ? JSON.stringify(persona) : "Non défini"}\n\nDONNÉES SEO (pour concepts "education"):\nMots-clés top:\n${keywordsContext}\n\nQuick Wins SEO:\n${quickWinsContext}\n\nQuestions PAA du public:\n${paaQuestions.length > 0 ? paaQuestions.map((q) => `- ${q}`).join("\n") : "Aucune question PAA"}\n\nDONNÉES PUBLICITAIRES (pour concepts "conversion"):\nAds performantes:\n${adsContext}\n\nGénère les 30 concepts maintenant.`
      ),
    ];

    const claude = getClaude();
    const parser = getStringParser();
    const result = await parser.invoke(await claude.invoke(conceptMessages));

    // Parser le JSON
    const cleanJson = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const concepts: ContentConcept[] = JSON.parse(cleanJson);

    // Valider la structure
    if (!Array.isArray(concepts) || concepts.length === 0) {
      return { success: false, error: "Aucun concept généré" };
    }

    // Garantir que les réseaux assignés sont dans la liste autorisée
    const filteredConcepts = concepts.map((c: ContentConcept) => ({
      ...c,
      targetNetworks: c.targetNetworks.filter((n) => allowedNetworks.includes(n as string)),
    }));

    return { success: true, concepts: filteredConcepts };
  } catch (error) {
    console.error("[Content Factory] Erreur generateContentConcepts:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. MULTI-FORMAT POST GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère tous les formats de post pour un concept donné
 */
export async function generatePostFormats(
  concept: ContentConcept,
  persona: MarketingPersona,
  brandVoice: Record<string, unknown>,
  brandType: BrandType = "B2C"
): Promise<GeneratedPostSet> {
  const openai = getOpenAI();
  const parser = getStringParser();
  const brandTypeCtx = getBrandTypeContext(brandType);

  const brandContext = `
Ton: ${persona.tone}
Audience: ${persona.targetAudience}
Piliers: ${persona.contentPillars.join(", ")}
Proposition de valeur: ${persona.uniqueValueProp}
Type de marque: ${brandType === "PERSONAL_BRAND" ? "Personal Brand" : brandType}
${brandTypeCtx.postToneInstructions}`;

  const result: GeneratedPostSet = { conceptIndex: concept.index };

  // Générer en parallèle pour chaque réseau cible
  const promises: Promise<void>[] = [];

  if (concept.targetNetworks.includes("LINKEDIN")) {
    promises.push(
      (async () => {
        const linkedinStyle = brandType === "PERSONAL_BRAND"
          ? "personal branding LinkedIn (première personne, récit personnel, prise de position)"
          : brandType === "B2B"
          ? "content marketing B2B LinkedIn (cas clients, ROI, insights sectoriels, ton professionnel)"
          : "brand content LinkedIn (valeurs de marque, bénéfices, communauté)";
        const msgs = [
          new SystemMessage(
            `Tu es un expert en ${linkedinStyle}. Crée un post LinkedIn percutant.\n\nRègles:\n- Hook: première ligne accrocheuse (question ou stat choc)\n- Corps: insights avec espaces entre paragraphes courts\n- Conclusion: leçon ou call-to-action\n- 3-5 hashtags pertinents\n- Longueur: 1200-1500 caractères\n- Adapte au ton de la marque\n\n${brandContext}`
          ),
          new HumanMessage(
            `Sujet: ${concept.title}\nAngle: ${concept.angle}\nCatégorie: ${concept.category}${concept.sourceKeyword ? `\nMot-clé SEO à intégrer: ${concept.sourceKeyword}` : ""}\n\nGénère le post LinkedIn complet.`
          ),
        ];
        result.linkedin = await parser.invoke(await openai.invoke(msgs));
      })()
    );
  }

  if (concept.targetNetworks.includes("X")) {
    promises.push(
      (async () => {
        const msgs = [
          new SystemMessage(
            `Tu es un expert en contenu viral X (Twitter). Crée un thread de 5-7 tweets.\n\nRègles:\n- Tweet 1: hook accrocheur\n- Tweets suivants: points clés avec valeur\n- Dernier tweet: call-to-action\n- Chaque tweet: max 280 caractères\n- Numérote les tweets (1/, 2/, etc.)\n\n${brandContext}`
          ),
          new HumanMessage(
            `Sujet: ${concept.title}\nAngle: ${concept.angle}\nCatégorie: ${concept.category}${concept.sourceKeyword ? `\nMot-clé à intégrer: ${concept.sourceKeyword}` : ""}\n\nGénère le thread complet.`
          ),
        ];
        result.xThread = await parser.invoke(await openai.invoke(msgs));
      })()
    );
  }

  if (concept.targetNetworks.includes("INSTAGRAM")) {
    promises.push(
      (async () => {
        const msgs = [
          new SystemMessage(
            `Tu es un expert Instagram. Génère une légende Instagram ET un prompt de génération d'image.\n\nRéponds au format JSON avec exactement 2 champs:\n- "caption": légende Instagram (max 2200 chars, avec emojis, hashtags, call-to-action)\n- "imagePrompt": prompt détaillé pour générer l'image (en anglais, style professionnel, couleurs de la marque: ${persona.brandColors.join(", ")})\n\nRéponds UNIQUEMENT avec le JSON valide.\n\n${brandContext}`
          ),
          new HumanMessage(
            `Sujet: ${concept.title}\nAngle: ${concept.angle}\nCatégorie: ${concept.category}\n\nGénère la légende et le prompt image.`
          ),
        ];
        const raw = await parser.invoke(await openai.invoke(msgs));
        try {
          const cleanJson = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          result.instagramCaption = parsed.caption;
          result.instagramImagePrompt = parsed.imagePrompt;
        } catch {
          // Fallback: utiliser le texte brut comme caption
          result.instagramCaption = raw;
        }
      })()
    );
  }

  if (concept.targetNetworks.includes("TIKTOK")) {
    promises.push(
      (async () => {
        const msgs = [
          new SystemMessage(
            `Tu es un expert en contenu TikTok viral. Crée un script structuré de 30-60 secondes.\n\nFormat obligatoire:\n[HOOK - 3 premières secondes]\n(texte parlé + indication visuelle)\n\n[BODY - 20-40 secondes]\n(points clés avec [VISUEL] indications)\n\n[CTA - 5-10 secondes]\n(call-to-action + indication visuelle)\n\n${brandContext}`
          ),
          new HumanMessage(
            `Sujet: ${concept.title}\nAngle: ${concept.angle}\nCatégorie: ${concept.category}\n\nGénère le script TikTok complet.`
          ),
        ];
        result.tiktokScript = await parser.invoke(await openai.invoke(msgs));
      })()
    );
  }

  if (concept.targetNetworks.includes("FACEBOOK")) {
    promises.push(
      (async () => {
        const msgs = [
          new SystemMessage(
            `Tu es un expert en marketing Facebook. Crée un post Facebook engageant adapté à l'algorithme de la plateforme.\n\nRègles:\n- Accroche dès la première ligne (avant le "Voir plus")\n- Structure narrative : problème → solution → résultat\n- Longueur : 300-600 caractères (lisible sans cliquer "Voir plus")\n- 2-3 emojis max placés stratégiquement\n- 1 question ouverte pour favoriser les commentaires\n- 1 call-to-action clair en fin de post\n- 3-5 hashtags en fin de post\n- Pas de lien dans le corps (favorise la portée organique)\n\n${brandContext}`
          ),
          new HumanMessage(
            `Sujet: ${concept.title}\nAngle: ${concept.angle}\nCatégorie: ${concept.category}${concept.sourceKeyword ? `\nMot-clé à intégrer: ${concept.sourceKeyword}` : ""}\n\nGénère le post Facebook complet.`
          ),
        ];
        result.facebookPost = await parser.invoke(await openai.invoke(msgs));
      })()
    );
  }

  await Promise.all(promises);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. INTELLIGENT SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════

interface ScheduleItem {
  postId: string;
  type: string;
  category: string;
}

interface ScheduledPost {
  postId: string;
  scheduledAt: Date;
}

// Horaires optimaux par réseau
const OPTIMAL_TIMES: Record<string, { days: number[]; hours: number[][] }> = {
  LINKEDIN: { days: [1, 3, 5], hours: [[8, 30], [12, 0]] },       // Lun, Mer, Ven
  X: { days: [1, 2, 3, 4, 5], hours: [[9, 0], [17, 0]] },         // Lun-Ven
  INSTAGRAM: { days: [2, 4, 6], hours: [[12, 0], [18, 0]] },       // Mar, Jeu, Sam
  TIKTOK: { days: [1, 3, 5, 0], hours: [[19, 0], [20, 0]] },      // Lun, Mer, Ven, Dim
  FACEBOOK: { days: [3, 5, 6], hours: [[13, 0], [15, 0]] },       // Mer, Ven, Sam
};

/**
 * Distribue les posts dans le calendrier du mois avec un espacement intelligent
 */
export async function autoSchedule(
  posts: ScheduleItem[],
  month: number,
  year: number,
  _objectives: string[]
): Promise<ScheduledPost[]> {
  const scheduled: ScheduledPost[] = [];

  // Grouper les posts par type de réseau
  const byNetwork: Record<string, ScheduleItem[]> = {};
  for (const post of posts) {
    if (!byNetwork[post.type]) byNetwork[post.type] = [];
    byNetwork[post.type].push(post);
  }

  // Pour chaque réseau, distribuer sur les jours optimaux du mois
  for (const [network, networkPosts] of Object.entries(byNetwork)) {
    const config = OPTIMAL_TIMES[network] ?? OPTIMAL_TIMES.LINKEDIN;

    // Trouver tous les jours valides du mois
    const validDays: Date[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ...
      if (config.days.includes(dayOfWeek)) {
        validDays.push(date);
      }
    }

    // Distribuer les posts uniformément sur les jours valides
    for (let i = 0; i < networkPosts.length; i++) {
      const dayIndex = i % validDays.length;
      const day = validDays[dayIndex];
      const timeSlot = config.hours[i % config.hours.length];

      const scheduledAt = new Date(day);
      scheduledAt.setHours(timeSlot[0], timeSlot[1], 0, 0);

      scheduled.push({
        postId: networkPosts[i].postId,
        scheduledAt,
      });
    }
  }

  return scheduled;
}
