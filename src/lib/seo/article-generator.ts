/**
 * ✍️ Enhanced Article Generator
 *
 * Pipeline complet de génération d'article SEO:
 * 1. Outline (si non fourni)
 * 2. Recherche de sources
 * 3. Génération avec LLM (prompt adapté au mode)
 * 4. Post-processing (meta, TOC, FAQ, scoring)
 *
 * Modes disponibles : article | affiliation | ecommerce | discovery | local
 * Règles SEO de base appliquées à tous les modes :
 *   - Maillage interne (liens vers articles existants)
 *   - Liens externes vers sources autoritaires
 *   - Lien optimisé vers page d'accueil / landing page / fiche produit
 */

import { getOpenAI, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { searchCompetitorContent, getRelatedKeywords } from "@/lib/ai/serper";
import { generateArticleOutline } from "./outline-generator";
import { scoreArticleContent } from "./content-optimizer";
import type { ArticleOutline, GeneratedArticle } from "@/types/seo";
import type { SeoContentMode } from "@/actions/seo-setup";

// ─── SEO Linking rules (common baseline) ─────────────────────────────────────

const SEO_LINKING_RULES = `
RÈGLES SEO OBLIGATOIRES — LIENS :
1. MAILLAGE INTERNE : Intègre 2-4 liens internes vers les articles existants fournis. Utilise un ancre descriptif et contextuel (jamais "cliquez ici"). Format : [titre de l'article](URL_INTERNE).
2. LIENS EXTERNES : Ajoute 2-3 liens vers des sources externes autoritaires (études, Wikipedia, sites officiels, médias reconnus). Ouvre sur un nouvel onglet si possible.
3. LIEN HOMEPAGE / LANDING PAGE : Intègre au moins 1 lien optimisé vers la page d'accueil ou la landing page principale du site, avec une ancre contenant le mot-clé principal ou la marque.
4. DENSITÉ LIENS : Maximum 1 lien par 150 mots. Ne surchargez pas.
5. ANCRES VARIÉES : Diversifiez les ancres (exact match, partiel, générique). Évitez la sur-optimisation.
`;

// ─── Site type context helpers ───────────────────────────────────────────────

const SITE_TYPE_LABELS: Record<string, string> = {
  saas: "SaaS / Application web",
  ecommerce: "E-commerce / boutique en ligne",
  services: "Site de services / agence / freelance",
  blog_affiliation: "Blog / affiliation (pas de produits propres)",
  media: "Média / presse / magazine en ligne",
  local_business: "Commerce local / entreprise locale",
  marketplace: "Marketplace / plateforme multi-vendeurs",
  portfolio: "Portfolio / site vitrine",
};

const SITE_TYPE_CONTENT_RULES: Record<string, string> = {
  saas: `- Mets en avant les bénéfices du logiciel/outil dans le contenu (sans survendre)
- Intègre un lien vers la landing page ou la page de démo/essai gratuit avec une ancre CTA naturelle
- Le ton est expert, éducatif et orienté résolution de problème`,

  ecommerce: `- Chaque article doit lier vers la catégorie ou fiche produit concernée avec une ancre contenant le mot-clé produit
- Intègre des éléments de réassurance (livraison, retours, garantie) naturellement dans le texte
- Le contenu sert à attirer du trafic pré-achat (intent transactionnel)`,

  services: `- Met en avant l'expertise et le savoir-faire à travers des exemples concrets, études de cas ou résultats clients
- Intègre un lien vers la page de contact ou de devis avec une ancre naturelle
- Le ton est professionnel et crée de la confiance (E-E-A-T élevé)`,

  blog_affiliation: `- Le site ne vend pas ses propres produits : le contenu est éditorial et oriente vers des offres tierces
- Intègre des liens d'affiliation ou comparatifs de manière naturelle et transparente
- Couvre le sujet de manière neutre et informative pour TOUS les lecteurs, sans biais de marque`,

  media: `- Adopte un style journalistique : faits vérifiés, sources citées, angle éditorial clair
- Pas de CTA commercial direct — favorise l'engagement (partage, commentaires, articles liés)
- Priorité à la fraîcheur de l'information et à la précision`,

  local_business: `- Mentionne systématiquement la ville/région dans les sections clés
- Intègre un lien vers la page de contact local avec adresse et horaires
- Crée des pages dédiées par zone géographique si le contenu couvre plusieurs villes`,

  marketplace: `- Le contenu attire des vendeurs ET des acheteurs : adapter l'angle selon le mot-clé
- Liens vers les catégories de la marketplace et vers la page d'inscription vendeur/acheteur
- Privilégier le contenu de confiance (avis, garanties, sécurité des transactions)`,

  portfolio: `- Le contenu valorise les compétences et réalisations du créateur
- Lien vers les projets ou pages de contact naturellement intégré
- Ton authentique et personnel — éviter le jargon marketing`,
};

// ─── Mode-specific system prompts ────────────────────────────────────────────

function getModeSystemPrompt(
  mode: SeoContentMode,
  targetWords: number,
  brandVoiceSection: string,
  businessActivity?: string,
  siteType?: string
): string {
  // Context block injected into every mode prompt
  const businessContext = (businessActivity || siteType)
    ? `CONTEXTE DU SITE :
${businessActivity ? `- Activité / offre : ${businessActivity}` : ""}
${siteType ? `- Type de site : ${SITE_TYPE_LABELS[siteType] ?? siteType}` : ""}
${SITE_TYPE_CONTENT_RULES[siteType ?? ""] ?? ""}
`
    : "";

  const base = `Écris en Markdown avec la hiérarchie correcte (# H1, ## H2, ### H3). Paragraphes courts (3-4 phrases max). Longueur cible : ${targetWords} mots.

MÉTA (à inclure en commentaire HTML au tout début du document):
<!--META_TITLE: [meta title optimisé 50-60 caractères]-->
<!--META_DESCRIPTION: [meta description engageante 140-155 caractères avec le mot-clé]-->

${businessContext}${brandVoiceSection}

${SEO_LINKING_RULES}`;

  switch (mode) {
    case "affiliation":
      return `Tu es un rédacteur SEO expert en marketing d'affiliation. Tu rédiges des contenus qui rankent ET qui convertissent.

STRUCTURE OBLIGATOIRE AFFILIATION :
- H1 accrocheur avec mot-clé (ex : "Meilleur X : Comparatif 2025")
- Introduction : problème lecteur + promesse + mot-clé naturel
- Section "Notre sélection rapide" : tableau comparatif top 3-5 produits (colonnes : Produit | Note | Prix | Lien)
- Analyse détaillée de chaque produit : avantages, inconvénients, pour qui c'est fait, lien d'affiliation [Voir le prix](LIEN_AFFILIATION)
- Section "Comment choisir" : critères de sélection basés sur les PAA questions
- Verdict final : "Notre recommandation" avec CTA fort
- FAQ avec les questions les plus cherchées

RÈGLES AFFILIATION SPÉCIFIQUES :
- Chaque produit analysé doit avoir un lien [Voir le prix →](URL) ou [Commander](URL)
- Tableaux comparatifs en Markdown avec données réelles
- Badges/labels : ⭐ Meilleur rapport qualité-prix, 🏆 Notre choix n°1, 💰 Le moins cher
- Trust signals : date de mise à jour, "Testé par notre équipe", sources vérifiées
- Lien vers page d'accueil ou catégorie principale du site (maillage horizontal)
- 2 liens internes vers d'autres comparatifs ou guides liés

${base}`;

    case "ecommerce":
      return `Tu es un expert SEO e-commerce et copywriter de fiches produits. Tu crées des descriptions qui rankent sur Google ET font vendre.

STRUCTURE OBLIGATOIRE E-COMMERCE :
- H1 : [Nom Produit] — [Bénéfice Principal] | [Marque/Site]
- Introduction courte : bénéfice clé + mot-clé principal (2-3 phrases)
- Section "Pourquoi choisir ce produit" : 3-5 bullets points bénéfices (pas de features)
- Caractéristiques techniques : liste structurée (matière, dimensions, compatibilité, etc.)
- Section "Pour qui est-ce fait ?" : profil d'acheteur idéal
- Avis clients simulés / témoignages (placeholder [AVIS_CLIENT])
- CTA principal : [🛒 Ajouter au panier](URL_PRODUIT) ou [Voir la fiche produit](URL_PRODUIT)
- Produits complémentaires : liens vers 2-3 produits liés (maillage interne boutique)
- FAQ produit (3-5 questions liées au produit)

RÈGLES E-COMMERCE SPÉCIFIQUES :
- Schema Product intégré en commentaire : <!--SCHEMA_PRODUCT: {name, description, sku, price, availability}-->
- Lien vers la fiche produit principale avec ancre contenant le mot-clé produit
- Lien vers la catégorie parent du produit
- Lien vers la page d'accueil avec ancre marque
- Mots de conversion : "livraison rapide", "garantie X ans", "retour gratuit", "stock limité"
- Éviter le contenu dupliqué fournisseur : reformuler toutes les descriptions

${base}`;

    case "discovery":
      return `Tu es un expert en contenu viral et Google Discover. Tu crées des articles qui captent les tendances avant les concurrents et génèrent de l'engagement massif.

STRUCTURE OBLIGATOIRE DISCOVERY :
- H1 : titre émotionnel/intriguant avec chiffre ou question (ex : "7 signes que X va changer en 2025" / "Pourquoi tout le monde parle de X en ce moment")
- Introduction percutante : accroche émotionnelle en 2-3 phrases, rareté ou urgence, promesse forte
- Sous-titres H2 accrocheurs et curieux (curiosity gap, chiffres, émotions)
- Contenu scannable : listes, chiffres clés, citations, encadrés
- Section "Ce que les experts disent" avec citations externes
- Images : suggestions visuelles très descriptives [IMAGE : description précise pour l'IA]
- Conclusion : invite au débat, question ouverte, partage social
- Lien vers article approfondi interne (maillage thématique)

RÈGLES DISCOVERY SPÉCIFIQUES :
- Titres H2 optimisés pour l'engagement social (chiffres, questions, émotions)
- Contenu frais : références à des événements récents ou tendances actuelles
- Balise <!--SCHEMA_ARTICLE: {datePublished, dateModified, author}--> en commentaire
- Liens externes vers les sources des tendances (Twitter/X, études, Google Trends)
- Lien interne vers la catégorie principale ou page d'accueil avec ancre thématique
- Format "listes" et "quoi/pourquoi/comment" prioritaires pour Discover

${base}`;

    case "local":
      return `Tu es un expert SEO local. Tu crées des articles hyperlocaux qui dominent les recherches "près de chez moi" et les packs locaux Google.

STRUCTURE OBLIGATOIRE LOCAL :
- H1 : [Service/Produit] à [Ville/Région] — [Bénéfice ou Année]
- Introduction : mention de la ville/région dès la 1ère phrase, contexte local, mot-clé geo
- Section "Pourquoi choisir un prestataire local à [VILLE]" : avantages proximité
- Section "[SERVICE] dans les quartiers/communes de [RÉGION]" : liste des zones couvertes avec liens si pages dédiées
- Données locales : population, contexte économique, spécificités de la zone
- Section "Témoignages clients de [VILLE]" : placeholder [AVIS_LOCAL]
- Section "Comment nous contacter à [VILLE]" : adresse, horaires, carte (placeholder)
- FAQ locale : questions ciblant les variantes géographiques

RÈGLES SEO LOCAL SPÉCIFIQUES :
- Répéter la ville/région dans au moins 3 H2 de façon naturelle
- Schéma LocalBusiness en commentaire : <!--SCHEMA_LOCAL: {name, address, city, zip, phone, openingHours}-->
- Lien vers Google Maps (placeholder [LIEN_MAPS])
- Lien vers la page d'accueil avec ancre "[SERVICE] [VILLE]"
- Lien interne vers les pages des villes/régions voisines si disponibles
- Lien externe vers la mairie ou organisme officiel local pour la crédibilité

${base}`;

    case "article":
    default:
      return `Tu es un rédacteur SEO expert de classe mondiale. Tu génères des articles complets, optimisés et engageants qui rankent durablement.

STRUCTURE OBLIGATOIRE ARTICLE :
- H1 : titre optimisé contenant le mot-clé principal
- Introduction : problème/contexte + mot-clé + promesse (100-150 mots)
- Corps : sections H2/H3 selon le plan fourni, chaque section ≥ 200 mots
- Données et exemples : intègre des statistiques, chiffres, exemples concrets dans chaque section
- FAQ : reprends les questions PAA fournies avec des réponses complètes (50-100 mots chacune)
- Conclusion : synthèse + CTA engageant (abonnement, contact, article lié)

RÈGLES ARTICLE SPÉCIFIQUES :
- Mot-clé principal : densité 1-2%, présent dans H1, premier paragraphe, au moins 2 H2 et la meta
- Mots-clés secondaires : intégrés naturellement dans les H3 et le corps du texte
- Sémantique : utilise le champ lexical du mot-clé (synonymes, variantes longue-traîne)
- Lisibilité : score Flesch ≥ 60, phrases courtes, pas de jargon non expliqué

${base}`;
  }
}

function getModeHumanPrompt(mode: SeoContentMode): string {
  const linkingInstruction = `
LIENS À INTÉGRER :
- Liens internes vers les articles existants (listés ci-dessous) quand c'est pertinent
- Liens externes vers des sources autoritaires (à trouver selon le contexte)
- Lien vers la page d'accueil du site avec une ancre optimisée`;

  switch (mode) {
    case "affiliation":
      return `Mot-clé principal: {keyword}

PLAN DE L'ARTICLE:
{outlineText}

SOURCES DE RÉFÉRENCE:
{sourcesText}

MOTS-CLÉS SECONDAIRES à intégrer: {relatedKeywords}

QUESTIONS FAQ à traiter:
{faqQuestions}

{internalLinksSection}
${linkingInstruction}

⚡ RAPPEL MODE AFFILIATION : Intègre des liens de type [Voir le prix →](URL_AFFILIATION), un tableau comparatif et une section "Notre recommandation". Optimise pour la conversion ET le ranking.

Rédige l'article complet maintenant.`;

    case "ecommerce":
      return `Mot-clé principal (= nom du produit ou catégorie): {keyword}

PLAN DE L'ARTICLE:
{outlineText}

SOURCES DE RÉFÉRENCE (concurrents, fiches produits similaires):
{sourcesText}

MOTS-CLÉS SECONDAIRES à intégrer: {relatedKeywords}

QUESTIONS FAQ à traiter:
{faqQuestions}

{internalLinksSection}
${linkingInstruction}

⚡ RAPPEL MODE E-COMMERCE : Intègre un CTA [🛒 Voir la fiche produit](URL_PRODUIT), le schema Product en commentaire, et des liens vers les produits complémentaires.

Rédige la fiche produit SEO complète maintenant.`;

    case "discovery":
      return `Mot-clé / sujet tendance: {keyword}

PLAN DE L'ARTICLE:
{outlineText}

SOURCES ET TENDANCES:
{sourcesText}

MOTS-CLÉS SECONDAIRES / ANGLES: {relatedKeywords}

QUESTIONS POSÉES PAR LE PUBLIC:
{faqQuestions}

{internalLinksSection}
${linkingInstruction}

⚡ RAPPEL MODE DISCOVERY : Titre H1 émotionnel avec chiffre ou tension. H2 curiosity-gap. Suggestions d'images [IMAGE : ...]. Liens vers sources tendances. Invite au débat en conclusion.

Rédige l'article Discovery maintenant.`;

    case "local":
      return `Mot-clé local (ex: "plombier Paris 15"): {keyword}

PLAN DE L'ARTICLE:
{outlineText}

SOURCES ET CONTEXTE LOCAL:
{sourcesText}

MOTS-CLÉS SECONDAIRES GÉOGRAPHIQUES: {relatedKeywords}

QUESTIONS LOCALES FRÉQUENTES:
{faqQuestions}

{internalLinksSection}
${linkingInstruction}

⚡ RAPPEL MODE LOCAL : Mention de la ville dès la 1ère phrase. Schema LocalBusiness en commentaire. Lien vers Google Maps [Voir sur la carte](URL_MAPS). Sections sur les quartiers/communes voisines.

Rédige l'article local complet maintenant.`;

    case "article":
    default:
      return `Mot-clé principal: {keyword}

PLAN DE L'ARTICLE:
{outlineText}

SOURCES DE RÉFÉRENCE:
{sourcesText}

MOTS-CLÉS SECONDAIRES à intégrer: {relatedKeywords}

QUESTIONS FAQ à traiter:
{faqQuestions}

{internalLinksSection}
${linkingInstruction}

Rédige l'article complet maintenant.`;
  }
}

// ─── Main generator ───────────────────────────────────────────────────────────

interface GenerateArticleParams {
  keyword: string;
  outline?: ArticleOutline;
  brandVoice?: Record<string, unknown>;
  workspaceId: string;
  existingArticleTitles?: string[];
  contentMode?: SeoContentMode;
}

export async function generateEnhancedArticle(
  params: GenerateArticleParams
): Promise<GeneratedArticle> {
  const { keyword, brandVoice, existingArticleTitles = [] } = params;

  // Résoudre le mode + contexte métier depuis brandVoice.seoPublicationStrategy
  const seoStrategy = (brandVoice?.seoPublicationStrategy as Record<string, unknown>) ?? {};
  const contentMode: SeoContentMode =
    params.contentMode ?? (seoStrategy.contentMode as SeoContentMode) ?? "article";
  const businessActivity = (seoStrategy.businessActivity as string | undefined) ?? "";
  const siteType = (seoStrategy.siteType as string | undefined) ?? "";

  // 1. Générer l'outline si non fourni
  const outline = params.outline || (await generateArticleOutline(keyword, brandVoice));

  // 2. Rechercher des sources
  let sourcesText = "Pas de sources disponibles.";
  try {
    const sources = await searchCompetitorContent(keyword);
    sourcesText = sources
      .slice(0, 5)
      .map((s) => `- ${s.title}: ${s.snippet}`)
      .join("\n");
  } catch {
    // Continuer sans sources
  }

  // 3. Mots-clés liés
  let relatedKws: string[] = [];
  try {
    relatedKws = await getRelatedKeywords(keyword);
  } catch {
    // Continuer sans mots-clés liés
  }

  // 4. Construire le texte du plan
  const outlineText = outline.sections
    .map((s) => {
      const prefix = s.level === 2 ? "##" : "###";
      const points = s.keyPoints.map((p) => `  - ${p}`).join("\n");
      return `${prefix} ${s.heading} (~${s.suggestedWordCount} mots)\n${points}`;
    })
    .join("\n\n");

  // 5. FAQ
  const faqQuestions =
    outline.faqQuestions.length > 0
      ? outline.faqQuestions.map((q) => `- ${q}`).join("\n")
      : "- Pas de questions FAQ spécifiques";

  // 6. Liens internes
  const internalLinksSection =
    existingArticleTitles.length > 0
      ? `ARTICLES EXISTANTS (propose des liens internes contextuels vers ceux-ci) :\n${existingArticleTitles
          .slice(0, 10)
          .map((t) => `- ${t}`)
          .join("\n")}`
      : "LIENS INTERNES : Aucun article existant fourni — insère des liens vers la page d'accueil et les sections principales du site.";

  // 7. Brand voice section
  const brandVoiceSection = brandVoice
    ? `TON DE VOIX : ${JSON.stringify(brandVoice)}`
    : "TON : Professionnel et accessible, expertise sectorielle";

  // 8. Construire les messages selon le mode
  const targetWords = outline.estimatedWordCount || 2000;
  const systemContent = getModeSystemPrompt(contentMode, targetWords, brandVoiceSection, businessActivity, siteType);

  const humanTemplate = getModeHumanPrompt(contentMode);
  const humanContent = humanTemplate
    .replace("{keyword}", keyword)
    .replace("{outlineText}", outlineText)
    .replace("{sourcesText}", sourcesText)
    .replace("{relatedKeywords}", relatedKws.slice(0, 8).join(", ") || keyword)
    .replace("{faqQuestions}", faqQuestions)
    .replace("{internalLinksSection}", internalLinksSection);

  // 9. Générer l'article
  const openai = getOpenAI();
  const parser = getStringParser();
  const messages = [new SystemMessage(systemContent), new HumanMessage(humanContent)];
  const article = await parser.invoke(await openai.invoke(messages));

  // 10. Post-processing — extraire meta title et description
  let metaTitle = outline.metaTitle;
  let metaDescription = outline.metaDescription;

  const metaTitleMatch = article.match(/<!--META_TITLE:\s*(.+?)-->/);
  if (metaTitleMatch) metaTitle = metaTitleMatch[1].trim();

  const metaDescMatch = article.match(/<!--META_DESCRIPTION:\s*(.+?)-->/);
  if (metaDescMatch) metaDescription = metaDescMatch[1].trim();

  // Nettoyer les commentaires META et schema du contenu visible
  const cleanContent = article
    .replace(/<!--META_TITLE:.+?-->\n?/g, "")
    .replace(/<!--META_DESCRIPTION:.+?-->\n?/g, "")
    .replace(/<!--SCHEMA_\w+:[^>]*-->\n?/g, "")
    .trim();

  // Extraire le titre H1
  const h1Match = cleanContent.match(/^#\s+(.+)$/m);
  const title = h1Match ? h1Match[1] : outline.title;

  // Générer le sommaire
  const tocRegex = /^(#{1,3})\s+(.+)$/gm;
  const tableOfContents: Array<{ text: string; level: number; id: string }> = [];
  let tocMatch;
  while ((tocMatch = tocRegex.exec(cleanContent)) !== null) {
    const level = tocMatch[1].length;
    const text = tocMatch[2];
    const id = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    tableOfContents.push({ text, level, id });
  }

  // Extraire les FAQ
  const faqContent: Array<{ question: string; answer: string }> = [];
  const faqSectionMatch = cleanContent.match(
    /(?:##\s*(?:FAQ|Questions?\s+[Ff]réquentes)[\s\S]*?)(?=\n##\s|$)/
  );
  if (faqSectionMatch) {
    const faqSection = faqSectionMatch[0];
    const questionRegex = new RegExp(
      "(?:###?\\s*(?:\\d+[.)]\\s*)?)(.+\\?)\\s*\\n([\\s\\S]*?)(?=\\n###?\\s|\\n##\\s|$)",
      "g"
    );
    let qMatch;
    while ((qMatch = questionRegex.exec(faqSection)) !== null) {
      faqContent.push({
        question: qMatch[1].trim(),
        answer: qMatch[2].trim(),
      });
    }
  }

  // Compter les mots
  const wordCount = cleanContent
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  // Excerpt
  const contentWithoutTitle = cleanContent.replace(/^#\s+.+$/m, "").trim();
  const excerpt =
    contentWithoutTitle
      .replace(/[#*\[\]()]/g, "")
      .slice(0, 200)
      .trim() + "...";

  // 11. Scoring SEO
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
    relatedKeywords: relatedKws,
  };
}
