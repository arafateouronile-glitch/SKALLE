import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// Lazy initialization to avoid build-time errors
let _openai: ChatOpenAI | null = null;
let _claude: ChatAnthropic | null = null;
let _stringParser: StringOutputParser | null = null;

// OpenAI GPT-4o-mini configuration (utilisé pour les drafts et planification)
export function getOpenAI(): ChatOpenAI {
  if (!_openai) {
    _openai = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

// Anthropic Claude Sonnet (dernière version) — utilisé par le brain pour analyze() et learnFromPerformance()
export function getClaude(): ChatAnthropic {
  if (!_claude) {
    _claude = new ChatAnthropic({
      model: "claude-sonnet-4-6",
      temperature: 0.7,
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Prompt caching : économise les tokens sur les system prompts répétés
      clientOptions: {
        defaultHeaders: { "anthropic-beta": "prompt-caching-2024-07-31" },
      },
    });
  }
  return _claude;
}

// Output parser
export function getStringParser(): StringOutputParser {
  if (!_stringParser) {
    _stringParser = new StringOutputParser();
  }
  return _stringParser;
}

// Deprecated - use getOpenAI() instead
export const openai = null as unknown as ChatOpenAI;
export const claude = null as unknown as ChatAnthropic;
export const stringParser = null as unknown as StringOutputParser;

// Brand Voice Analysis Prompt
export const brandVoicePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en analyse de marque et de ton de voix. Analyse le contenu fourni et génère un profil de marque détaillé au format JSON.

Le JSON doit contenir exactement ces champs:
- tone: "formal" | "casual" | "professional" | "friendly" | "technical"
- style: description du style d'écriture (max 100 caractères)
- keywords: array des 10 mots-clés les plus utilisés
- values: array des 5 valeurs de marque identifiées
- targetAudience: description de l'audience cible
- writingGuidelines: array de 5 règles d'écriture à suivre

Réponds UNIQUEMENT avec le JSON valide, sans markdown ni explication.`,
  ],
  ["human", "Analyse ce contenu de site web:\n\n{content}"],
]);

// SEO Article Generation Prompt
export const seoArticlePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en rédaction SEO. Génère un article optimisé pour le référencement.

Instructions:
- Longueur: environ 2000 mots
- Structure: H1, H2, H3 avec hiérarchie claire
- Inclus une introduction captivante
- Utilise des paragraphes courts (3-4 phrases max)
- Intègre naturellement les mots-clés
- Ajoute une conclusion avec call-to-action
- Utilise le ton de voix de la marque si fourni

Format de sortie: Markdown avec balises de titre`,
  ],
  [
    "human",
    `Mot-clé principal: {keyword}
Sources à utiliser: {sources}
Ton de voix: {brandVoice}

Génère l'article SEO complet.`,
  ],
]);

// Content Repurposing Prompts
export const twitterThreadPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en création de contenu viral pour X (Twitter).

Transforme l'article en un thread de 5-7 tweets:
- Premier tweet: hook accrocheur avec emoji
- Tweets suivants: points clés avec valeur
- Dernier tweet: call-to-action
- Chaque tweet: max 280 caractères
- Numérote les tweets (1/, 2/, etc.)`,
  ],
  ["human", "Article à transformer:\n\n{article}"],
]);

export const linkedinPostPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en personal branding LinkedIn.

Crée un post LinkedIn percutant:
- Hook: première ligne accrocheuse
- Corps: histoire ou insights avec espaces entre paragraphes
- Conclusion: leçon ou call-to-action
- Hashtags pertinents (3-5)
- Longueur: 1200-1500 caractères`,
  ],
  ["human", "Article à transformer:\n\n{article}"],
]);

export const tiktokScriptPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en contenu TikTok viral.

Crée un script TikTok de 30-60 secondes:
- Hook: 3 premières secondes captivantes
- Corps: contenu éducatif ou divertissant
- Call-to-action final
- Indique les moments visuels/actions
- Format: [VISUEL] + texte parlé`,
  ],
  ["human", "Article à transformer:\n\n{article}"],
]);

export const instagramCaptionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en contenu Instagram viral.

Crée une légende Instagram engageante:
- Hook visuel dans les 2 premières lignes (arrête le scroll)
- Storytelling ou insight clé avec espaces entre paragraphes
- Appel à l'action (commente, enregistre, partage)
- 15-20 hashtags pertinents (mix populaires et niche)
- Longueur: 150-300 mots
- Inclus des emojis stratégiquement placés`,
  ],
  ["human", "Article à transformer:\n\n{article}"],
]);

export const newsletterExtractPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en email marketing et newsletters.

Crée un extrait newsletter captivant au format suivant:

OBJET: [objet email accrocheur, max 60 caractères]
PRÉHEADER: [texte préheader mystérieux, max 90 caractères]

---

[Introduction personnalisée, 2-3 phrases conversationnelles]

Les 3 points clés à retenir:
• [point 1]
• [point 2]
• [point 3]

[Teaser de la suite + CTA vers l'article complet, ton chaud et direct]`,
  ],
  ["human", "Article à transformer:\n\n{article}"],
]);

// LinkedIn Prospection Prompt
export const prospectionSequencePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en cold outreach LinkedIn B2B.

Génère une séquence de 3 messages personnalisés:

Message 1 - Approche:
- Personnalisation basée sur le profil
- Pas de pitch, juste connexion
- Question ouverte

Message 2 - Valeur:
- Partage d'insight ou ressource
- Lié à leur activité
- Teaser de solution

Message 3 - CTA:
- Proposition concrète
- Faciliter la réponse
- Urgence douce

Format: JSON avec keys "message1", "message2", "message3"`,
  ],
  [
    "human",
    `Profil prospect:
Nom: {name}
Entreprise: {company}
Poste: {jobTitle}
Notes: {notes}

Notre offre: Services de marketing automatisé avec IA`,
  ],
]);

// Helper function to create chains
export function createChain<T>(
  prompt: ChatPromptTemplate,
  model?: ChatOpenAI | ChatAnthropic
) {
  return prompt.pipe(model ?? getOpenAI()).pipe(getStringParser());
}
