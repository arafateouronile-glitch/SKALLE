/**
 * ✍️ SEO Expert Writer — Machine de Guerre Éditoriale
 *
 * Service de rédaction SEO de niveau expert avec :
 * - System Prompt E-E-A-T avancé (30 ans d'expérience simulée)
 * - Workflow agentique : Brief → Outline → Rédaction → Post-Processing
 * - Tableaux Markdown automatiques pour comparaisons
 * - Balises [IMAGE_PROMPT] remplacées par Nano Banana (Gemini 2.5 Flash Image)
 * - Sources intégrées avec ancres de lien naturelles
 * - Retourne un article Markdown prêt pour la table Post de Prisma
 */

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchCompetitorContent, getRelatedKeywords } from "@/lib/ai/serper";
import { generateArticleOutline } from "@/lib/seo/outline-generator";
import { scoreArticleContent } from "@/lib/seo/content-optimizer";
import {
  generateNanoBananaImage,
  generateNanoBananaImageRaw,
  buildSEOArticleImagePrompt,
  type NanaBananaOptions,
} from "@/lib/services/image/nano-banana";
import type { ArticleOutline, GeneratedArticle } from "@/types/seo";

// ═══════════════════════════════════════════════════════════════════════════
// 📋 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ArticleInput {
  /** Mot-clé principal de l'article */
  keyword: string;
  /** Sources d'autorité pré-récupérées (optionnel, sinon Serper les cherche) */
  sources?: Array<{ title: string; url: string; snippet: string }>;
  /** Description du persona cible (ex: "PME francophone cherchant à automatiser leur marketing") */
  targetPersona?: string;
  /** Mots-clés LSI / sémantiques secondaires */
  lsiKeywords?: string[];
  /** Plan d'article pré-généré (optionnel, sinon généré automatiquement) */
  outline?: ArticleOutline;
  /** Ton de voix de la marque (JSON issu de l'analyse de brand voice) */
  brandVoice?: Record<string, unknown>;
  /** Titres des articles existants (pour liens internes) */
  existingArticleTitles?: string[];
  /** Nombre de mots cible (défaut : 2000) */
  targetWords?: number;
  /**
   * Activer la génération d'images via Nano Banana (Gemini 2.5 Flash Image).
   * Désactivé par défaut (coût : 5 crédits/image).
   * Activer pour les articles premium ou les plans Business+.
   */
  generateImages?: boolean;
  /**
   * ID utilisateur Skalle (requis si generateImages: true, pour déduction crédits).
   * Facultatif si appelé dans un contexte Inngest (utiliser generateNanoBananaImageRaw).
   */
  userId?: string;
  /** ID du workspace (pour audit trail des crédits image) */
  workspaceId?: string;
  /** Mode de contenu SEO : article | affiliation | ecommerce | discovery | local */
  contentMode?: string;
}

export interface EliteArticle extends GeneratedArticle {
  /** Images générées avec leurs prompts */
  generatedImages: Array<{ prompt: string; url: string | null }>;
  /** URL de l'image principale (première image générée) */
  featuredImageUrl: string | null;
  /** Sources utilisées dans l'article */
  sources: Array<{ title: string; url: string; snippet: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎭 SYSTEM PROMPT — Expert Rédacteur & Stratège SEO
// ═══════════════════════════════════════════════════════════════════════════

const EXPERT_SEO_WRITER_SYSTEM = `Tu es l'Expert Principal de Skalle, un rédacteur SEO avec 30 ans d'expérience cumulée dans le journalisme d'investigation, le copywriting de performance et le référencement naturel avancé.

TES RÈGLES D'OR :

1. E-E-A-T ABSOLU — Tu ne simplifies jamais à l'excès. Chaque section apporte de la valeur concrète : chiffres sourcés, exemples réels, nuances expertes. Tu montres l'expérience, l'expertise, l'autorité et la fiabilité à chaque paragraphe.

2. STYLE HUMAIN ET DYNAMIQUE — Tu évites le style "robotique" à tout prix. Tes phrases sont courtes (15 mots max en moyenne). Tu poses des questions rhétoriques. Tu utilises des transitions naturelles ("Mais attention :", "Voilà ce que les experts oublient souvent :"). Tu supprimes les adverbes en "-ment" superflus et le jargon creux ("synergies", "innovant", "révolutionnaire").

3. STRUCTURE SEO PARFAITE — Hiérarchie Hn rigoureuse : un seul H1, des H2 pour les sections principales, des H3 pour les sous-points. Tu réponds à l'intention de recherche dans les 100 premiers mots (capture de la Position Zéro). Ton introduction accroche, expose le problème, et annonce la solution en 3 phrases.

4. RICHESSE SÉMANTIQUE — Tu intègres naturellement les mots-clés LSI et les entités nommées. La densité du mot-clé principal reste entre 1 % et 1,5 %. Pas de répétition mécanique, mais une variation sémantique intelligente.

TES CAPACITÉS SPÉCIALES :

TABLEAUX MARKDOWN : Dès qu'une comparaison, un benchmark ou une liste de données structurées est pertinente, tu génères un tableau Markdown complet (header + séparateur |---|--- + données alignées). Minimum 2 tableaux par article.

BALISES IMAGE : Immédiatement après chaque titre ## (H2), tu insères la balise suivante sur sa propre ligne :
[IMAGE_PROMPT: <description précise en anglais, style photorealistic professional blog illustration, 16:9, no text, no watermark>]
Ces balises seront automatiquement remplacées par des images générées par IA.

SOURCES AVEC ANCRES NATURELLES : Tu intègres les sources fournies avec des ancres de lien naturelles et descriptives en Markdown. Jamais "[source ici]" ou "[1]". Toujours : [une étude de l'INSEE sur le commerce digital](URL) ou [selon les recommandations de Google Developers](URL).

FORMAT DE SORTIE OBLIGATOIRE :
1. Les deux balises meta en commentaires HTML (premières lignes) :
   <!--META_TITLE: [meta title SEO, 50-60 caractères, mot-clé en premier]-->
   <!--META_DESCRIPTION: [meta description, 140-155 caractères, bénéfice + CTA implicite]-->
2. L'article complet en Markdown pur (H1 → contenu → H2 → H3 → etc.)
3. Une section ## FAQ avec au moins 4 questions-réponses approfondies
4. Un ## Conclusion avec un CTA naturel et engageant
5. Aucun préambule, aucun commentaire en dehors des balises meta.`;

// ═══════════════════════════════════════════════════════════════════════════
// 📝 PROMPT DE RÉDACTION (User Message)
// ═══════════════════════════════════════════════════════════════════════════

const eliteWriterPrompt = ChatPromptTemplate.fromMessages([
  ["system", EXPERT_SEO_WRITER_SYSTEM],
  [
    "human",
    `Rédige un article pilier de {targetWords} mots sur : "{keyword}".

PLAN À SUIVRE SECTION PAR SECTION :
{outlineText}

SOURCES D'AUTORITÉ À INTÉGRER (avec ancres naturelles) :
{sourcesText}

MOTS-CLÉS LSI ET SÉMANTIQUES (à intégrer naturellement, sans forcer) :
{lsiKeywords}

QUESTIONS FAQ À TRAITER EN PROFONDEUR :
{faqQuestions}

PERSONA CIBLE (adapter le niveau de langage et les exemples) :
{targetPersona}
{brandVoiceSection}
{internalLinksSection}
RAPPELS TECHNIQUES :
- Insère [IMAGE_PROMPT: ...] immédiatement après chaque ## (H2)
- Génère au moins 2 tableaux Markdown là où c'est pertinent
- Réponds à l'intention de recherche dans les 100 premiers mots
- Intègre les sources avec des ancres descriptives et naturelles
- Commence OBLIGATOIREMENT par <!--META_TITLE: ...--> et <!--META_DESCRIPTION: ...-->

Rédige l'article complet maintenant.`,
  ],
]);

// ═══════════════════════════════════════════════════════════════════════════
// 🍌 POST-PROCESSING — Remplacement des balises [IMAGE_PROMPT] via Nano Banana
// ═══════════════════════════════════════════════════════════════════════════

interface ImageResult {
  prompt: string;
  url: string | null;
}

interface ImageProcessingContext {
  keyword: string;
  userId?: string;
  workspaceId?: string;
}

async function processImagePrompts(
  content: string,
  generateImages: boolean,
  ctx: ImageProcessingContext
): Promise<{
  processedContent: string;
  images: ImageResult[];
  featuredImageUrl: string | null;
}> {
  const IMAGE_TAG_REGEX = /\[IMAGE_PROMPT:\s*([^\]]+)\]/g;
  const matches: Array<{ fullMatch: string; prompt: string; sectionTitle: string }> = [];
  let match;

  // Récupérer aussi le titre H2 précédent pour contextualiser le prompt
  const lines = content.split("\n");
  let lastH2 = "";

  while ((match = IMAGE_TAG_REGEX.exec(content)) !== null) {
    // Trouver le H2 qui précède cette balise dans le texte
    const beforeMatch = content.slice(0, match.index);
    const h2Matches = [...beforeMatch.matchAll(/^## (.+)$/gm)];
    if (h2Matches.length > 0) {
      lastH2 = h2Matches[h2Matches.length - 1][1].trim();
    }
    matches.push({
      fullMatch: match[0],
      prompt: match[1].trim(),
      sectionTitle: lastH2,
    });
  }

  if (matches.length === 0) {
    return { processedContent: content, images: [], featuredImageUrl: null };
  }

  // Générer les images séquentiellement (Nano Banana : quota 1000/jour, pas besoin de rush)
  const imageResults: ImageResult[] = [];

  for (const { prompt, sectionTitle } of matches) {
    if (!generateImages) {
      imageResults.push({ prompt, url: null });
      continue;
    }

    // Construire un prompt enrichi optimisé pour le SEO
    const { prompt: enrichedPrompt, options } = buildSEOArticleImagePrompt(
      ctx.keyword,
      sectionTitle || ctx.keyword,
      prompt
    );

    let url: string | null = null;

    if (ctx.userId && ctx.workspaceId) {
      // Contexte complet (session utilisateur) → déduction crédits
      const result = await generateNanoBananaImage(
        enrichedPrompt,
        ctx.userId,
        ctx.workspaceId,
        options
      );
      url = result.url;
    } else {
      // Contexte Inngest / sans session → pas de déduction crédits (gérée par l'appelant)
      url = await generateNanoBananaImageRaw(enrichedPrompt, options);
    }

    imageResults.push({ prompt, url });
  }

  // Remplacer les balises dans le contenu
  let processedContent = content;
  for (let i = 0; i < matches.length; i++) {
    const { fullMatch, prompt } = matches[i];
    const result = imageResults[i];

    if (result.url) {
      // Alt text SEO = première phrase du prompt (avant la première virgule)
      const altText = prompt.split(",")[0].trim().slice(0, 120);
      processedContent = processedContent.replace(
        fullMatch,
        `\n![${altText}](${result.url})\n`
      );
    } else {
      // Image non générée → retirer la balise proprement
      processedContent = processedContent.replace(fullMatch, "");
    }
  }

  // Nettoyer les lignes vides multiples
  processedContent = processedContent.replace(/\n{3,}/g, "\n\n").trim();

  const featuredImageUrl = imageResults.find((r) => r.url !== null)?.url ?? null;

  return { processedContent, images: imageResults, featuredImageUrl };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 FONCTION PRINCIPALE — generateEliteArticle
// ═══════════════════════════════════════════════════════════════════════════

export async function generateEliteArticle(
  data: ArticleInput
): Promise<EliteArticle> {
  const {
    keyword,
    brandVoice,
    existingArticleTitles = [],
    targetWords = 2000,
    generateImages = false,
  } = data;

  // ── Étape A : Outline ─────────────────────────────────────────────────
  const outline =
    data.outline ?? (await generateArticleOutline(keyword, brandVoice));

  // ── Étape B : Sources + LSI (parallèle si non fournies) ───────────────
  let sources = data.sources ?? [];
  let lsiKeywords = data.lsiKeywords ?? [];

  const [sourcesResult, lsiResult] = await Promise.allSettled([
    sources.length === 0 ? searchCompetitorContent(keyword) : Promise.resolve([]),
    lsiKeywords.length === 0 ? getRelatedKeywords(keyword) : Promise.resolve([]),
  ]);

  if (sourcesResult.status === "fulfilled" && sourcesResult.value.length > 0) {
    sources = sourcesResult.value.slice(0, 5).map((s) => ({
      title: s.title,
      url: s.link,
      snippet: s.snippet,
    }));
  }

  if (lsiResult.status === "fulfilled" && lsiResult.value.length > 0) {
    lsiKeywords = lsiResult.value.slice(0, 8);
  }

  // ── Étape C : Construire les contextes injectés dans le prompt ─────────

  const outlineText = outline.sections
    .map((s) => {
      const prefix = s.level === 2 ? "##" : "###";
      const points = s.keyPoints.map((p) => `  - ${p}`).join("\n");
      return `${prefix} ${s.heading} (~${s.suggestedWordCount} mots)\n${points}`;
    })
    .join("\n\n");

  const sourcesText =
    sources.length > 0
      ? sources
          .map((s) => `- [${s.title}](${s.url}) : ${s.snippet.slice(0, 160)}`)
          .join("\n")
      : "Aucune source externe disponible — s'appuyer sur les connaissances générales vérifiables.";

  const faqQuestions =
    outline.faqQuestions.length > 0
      ? outline.faqQuestions.map((q) => `- ${q}`).join("\n")
      : "- Pas de questions FAQ spécifiques fournies.";

  const brandVoiceSection = brandVoice
    ? `\nTON DE VOIX DE LA MARQUE (respecter impérativement) :\n${JSON.stringify(brandVoice, null, 2)}\n`
    : "\nTON PAR DÉFAUT : Expert, direct, sans jargon inutile. Phrases courtes. Exemples concrets.\n";

  // Résoudre le mode + contexte métier depuis brandVoice.seoPublicationStrategy
  const seoStrategy =
    (brandVoice?.seoPublicationStrategy as Record<string, unknown> | undefined) ?? {};
  const contentMode: string =
    data.contentMode ?? (seoStrategy.contentMode as string | undefined) ?? "article";
  const businessActivity = (seoStrategy.businessActivity as string | undefined) ?? "";
  const siteType = (seoStrategy.siteType as string | undefined) ?? "";

  // Business context addendum injected into every prompt
  const businessContextAddendum = businessActivity || siteType
    ? `\nCONTEXTE DU SITE :\n${businessActivity ? `- Activité / offre : ${businessActivity}\n` : ""}${siteType ? `- Type de site : ${siteType}\n` : ""}`
    : "";

  const modeInstructions: Record<string, string> = {
    affiliation: `\nMODE AFFILIATION ACTIVÉ — RÈGLES SUPPLÉMENTAIRES :
- Structure : tableau comparatif produits (| Produit | Note | Prix | Lien |), section "Notre recommandation n°1", pros/cons par produit
- Liens d'affiliation : intègre des CTA [Voir le prix →](URL) et [Commander](URL) pour chaque produit analysé
- Trust signals : badge "⭐ Meilleur rapport qualité-prix", "🏆 Notre choix n°1", date de mise à jour
- Lien interne obligatoire vers la page d'accueil ou la catégorie principale du site (ancre contenant le mot-clé)\n`,
    ecommerce: `\nMODE E-COMMERCE ACTIVÉ — RÈGLES SUPPLÉMENTAIRES :
- Structure : bénéfices clés (pas de features), caractéristiques techniques tabulées, "Pour qui ?" section, CTA [🛒 Voir la fiche produit](URL)
- Schema Product en commentaire : <!--SCHEMA_PRODUCT: {name, description, price, availability}-->
- Liens : lien vers la fiche produit (ancre mot-clé produit), lien vers la catégorie parent, lien vers la page d'accueil avec ancre marque
- Mots de conversion : "livraison rapide", "garantie", "retour gratuit"\n`,
    discovery: `\nMODE DISCOVERY ACTIVÉ — RÈGLES SUPPLÉMENTAIRES :
- H1 émotionnel avec chiffre ou tension (ex : "7 signes que…", "Pourquoi tout le monde parle de…")
- H2 avec curiosity gap, chiffres, émotions — optimisés pour le partage social
- Schema Article en commentaire : <!--SCHEMA_ARTICLE: {datePublished, author}-->
- Liens externes vers les sources de tendances (études, données officielles)
- Conclusion : question ouverte invitant au débat, CTA de partage\n`,
    local: `\nMODE LOCAL SEO ACTIVÉ — RÈGLES SUPPLÉMENTAIRES :
- Mention de la ville/région dès la 1ère phrase du corps, dans au moins 3 H2, et dans la conclusion
- Schema LocalBusiness en commentaire : <!--SCHEMA_LOCAL: {name, address, city, zip}-->
- Lien vers Google Maps (placeholder [Voir sur Google Maps](URL_MAPS))
- Liens internes vers les pages des villes/communes voisines si disponibles
- Lien externe vers la mairie ou organisme officiel local (crédibilité locale)\n`,
    article: `\nMODE ARTICLE STANDARD — RÈGLES LIENS :
- 2-4 liens internes vers les articles existants listés (ancres descriptives et contextuelles)
- 2-3 liens externes vers sources autoritaires (Wikipedia, études, médias reconnus)
- 1 lien vers la page d'accueil ou section principale du site (ancre contenant le mot-clé ou la marque)\n`,
  };

  const modeAddendum = modeInstructions[contentMode] ?? modeInstructions.article;

  const internalLinksSection =
    (existingArticleTitles.length > 0
      ? `\nARTICLES EXISTANTS (intégrer des liens internes pertinents si opportun) :\n${existingArticleTitles
          .slice(0, 10)
          .map((t) => `- ${t}`)
          .join("\n")}\n`
      : "") + modeAddendum + businessContextAddendum;

  // ── Étape D : Génération de l'article avec Claude ─────────────────────
  const chain = eliteWriterPrompt.pipe(getClaude()).pipe(getStringParser());

  const rawArticle = await chain.invoke({
    keyword,
    outlineText,
    sourcesText,
    lsiKeywords: lsiKeywords.join(", ") || keyword,
    faqQuestions,
    targetWords,
    targetPersona:
      data.targetPersona ??
      "professionnels et décideurs francophones cherchant des informations fiables et actionnables",
    brandVoiceSection,
    internalLinksSection,
  });

  // ── Étape E : Extraire META TITLE et META DESCRIPTION ─────────────────
  let metaTitle = outline.metaTitle;
  let metaDescription = outline.metaDescription;

  const metaTitleMatch = rawArticle.match(/<!--META_TITLE:\s*(.+?)-->/);
  if (metaTitleMatch) metaTitle = metaTitleMatch[1].trim();

  const metaDescMatch = rawArticle.match(/<!--META_DESCRIPTION:\s*(.+?)-->/);
  if (metaDescMatch) metaDescription = metaDescMatch[1].trim();

  // Nettoyer les commentaires META du corps de l'article
  let cleanContent = rawArticle
    .replace(/<!--META_TITLE:.+?-->\n?/g, "")
    .replace(/<!--META_DESCRIPTION:.+?-->\n?/g, "")
    .trim();

  // ── Étape F : Post-processing — Images via Nano Banana ────────────────
  const { processedContent, images, featuredImageUrl } =
    await processImagePrompts(cleanContent, generateImages, {
      keyword,
      userId: data.userId,
      workspaceId: data.workspaceId,
    });

  cleanContent = processedContent;

  // ── Étape G : Extraire le titre H1 ────────────────────────────────────
  const h1Match = cleanContent.match(/^#\s+(.+)$/m);
  const title = h1Match ? h1Match[1].trim() : outline.title;

  // ── Étape H : Table des matières ──────────────────────────────────────
  const tocRegex = /^(#{1,3})\s+(.+)$/gm;
  const tableOfContents: Array<{ text: string; level: number; id: string }> = [];
  let tocMatch;
  while ((tocMatch = tocRegex.exec(cleanContent)) !== null) {
    const level = tocMatch[1].length;
    const text = tocMatch[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    tableOfContents.push({ text, level, id });
  }

  // ── Étape I : Extraire les FAQ ────────────────────────────────────────
  const faqContent: Array<{ question: string; answer: string }> = [];
  const faqSectionMatch = cleanContent.match(
    /(?:##\s*(?:FAQ|Questions?\s+[Ff]réquentes?)[\s\S]*?)(?=\n##\s|$)/
  );
  if (faqSectionMatch) {
    const faqSection = faqSectionMatch[0];
    const questionRegex =
      /(?:###?\s*(?:\d+[.)]\s*)?)(.+\?)\s*\n([\s\S]*?)(?=\n###?\s|\n##\s|$)/g;
    let qMatch;
    while ((qMatch = questionRegex.exec(faqSection)) !== null) {
      faqContent.push({
        question: qMatch[1].trim(),
        answer: qMatch[2].trim(),
      });
    }
  }

  // ── Étape J : Métriques ───────────────────────────────────────────────
  const wordCount = cleanContent
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const contentWithoutTitle = cleanContent.replace(/^#\s+.+$/m, "").trim();
  const excerpt =
    contentWithoutTitle
      .replace(/[#*\[\]()!]/g, "")
      .replace(/\n+/g, " ")
      .slice(0, 200)
      .trim() + "...";

  // ── Étape K : Scoring SEO ─────────────────────────────────────────────
  const seoFeedback = scoreArticleContent(
    cleanContent,
    keyword,
    metaTitle,
    metaDescription
  );

  return {
    title,
    content: cleanContent,
    excerpt,
    metaTitle,
    metaDescription,
    outline,
    faqContent,
    tableOfContents,
    wordCount,
    readabilityScore: seoFeedback.readability.fleschKincaid,
    seoScore: seoFeedback.overallScore,
    seoFeedback,
    relatedKeywords: lsiKeywords,
    generatedImages: images,
    featuredImageUrl,
    sources,
  };
}
