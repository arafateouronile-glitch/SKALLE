/**
 * 💼 LinkedIn Outreach - Top 1% Performance
 * 
 * Objectifs Top 1%:
 * - Connection acceptance > 70%
 * - Response rate > 25% (vs 10% moyenne)
 * - Meeting booked rate > 8% (vs 2% moyenne)
 * - Personalization score > 90%
 * 
 * Optimisations:
 * - Warm-up des profils (activité progressive)
 * - Icebreaker personnalisé avec GPT-4 (post récent, achievement)
 * - Timing optimal (mardi-mercredi 9-11h timezone prospect)
 * - Multi-step sequence (connect → follow-up → value → CTA)
 * - Comment-first approach (engagement avant outreach)
 * - Personalization engine LinkedIn avec GPT-4
 * - Response rate tracking et analytics
 */

import { getOpenAI, getClaude } from "@/lib/ai/langchain";
import { EnrichedLead } from "./enrichment";
import { searchGoogle } from "@/lib/ai/serper";
import { logger } from "@/lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LinkedInProfile {
  linkedInUrl: string;
  name: string;
  jobTitle?: string;
  company?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience?: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    field?: string;
  }>;
  skills?: string[];
  posts?: Array<{
    text: string;
    publishedAt: Date;
    likes?: number;
    comments?: number;
  }>;
  achievements?: Array<{
    type: "promotion" | "new_role" | "certification" | "achievement" | "milestone";
    description: string;
    date?: Date;
  }>;
}

export interface LinkedInPersonalizationInput {
  prospect: EnrichedLead & { linkedInProfile?: LinkedInProfile };
  sequenceStep: number; // 1-5 (multi-step sequence)
  ourOffer: string;
  ourCompany: string;
  previousMessages?: Array<{
    content: string;
    sentAt: Date;
    opened: boolean;
    replied: boolean;
    responseTime?: number; // Heures
  }>;
  connectionAccepted?: boolean;
}

export interface PersonalizedLinkedInMessage {
  content: string; // Message LinkedIn (300 caractères max pour connexion)
  connectionRequest?: string; // Message de demande de connexion
  personalizationScore: number; // 0-100
  personalizationPoints: string[]; // Points de personnalisation utilisés
  optimalSendTime: Date; // Timing optimal
  warmupRequired: boolean; // Si warm-up nécessaire
  commentFirst: boolean; // Si comment-first approach recommandé
  videoMessage?: string; // Script pour message vidéo (optionnel)
  recommendations: string[]; // Recommandations d'action
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 RESEARCH LINKEDIN PROFILE - Recherche approfondie du profil LinkedIn
// ═══════════════════════════════════════════════════════════════════════════

async function researchLinkedInProfile(
  linkedInUrl: string,
  name: string,
  company?: string
): Promise<{
  recentPosts: Array<{ text: string; publishedAt: Date; engagement: number }>;
  recentAchievements: Array<{ type: string; description: string; date?: Date }>;
  interests: string[];
  painPoints: string[];
  conversationStarters: string[];
}> {
  const empty = { recentPosts: [], recentAchievements: [], interests: [], painPoints: [], conversationStarters: [] };

  if (!process.env.SERPER_API_KEY) {
    logger.warn("SERPER_API_KEY manquant — research LinkedIn désactivé");
    return empty;
  }

  try {
    // Extraire le slug LinkedIn pour des recherches ciblées
    const slug = linkedInUrl.replace(/\/$/, "").split("/").pop() ?? name;

    // 2 requêtes parallèles : posts récents + changements de poste/achievements
    const [postsResults, achievementsResults] = await Promise.all([
      searchGoogle(`"${name}"${company ? ` "${company}"` : ""} site:linkedin.com`, 5).catch(() => []),
      searchGoogle(`"${name}" (promu OR "nouveau poste" OR "ravi de rejoindre" OR promoted OR "new role" OR "excited to join" OR certification) linkedin`, 5).catch(() => []),
    ]);

    // Construire les posts depuis les snippets Google (contenu indexé)
    const recentPosts = postsResults
      .filter(r => r.snippet && r.snippet.length > 30)
      .map(r => ({
        text: r.snippet,
        publishedAt: new Date(),
        engagement: 0,
      }));

    // Détecter les achievements depuis les snippets
    const achievementKeywords = ["promu", "promoted", "nouveau poste", "new role", "rejoint", "joined", "certifié", "certified", "certification", "nommé", "appointed"];
    const recentAchievements = achievementsResults
      .filter(r => achievementKeywords.some(kw => (r.snippet + r.title).toLowerCase().includes(kw)))
      .map(r => ({
        type: "new_role" as const,
        description: r.title || r.snippet.substring(0, 120),
        date: new Date(),
      }));

    // Analyser les snippets avec Claude pour extraire intérêts, pain points et conversation starters
    const allSnippets = [...postsResults, ...achievementsResults]
      .map(r => r.snippet)
      .filter(Boolean)
      .join("\n\n");

    let interests: string[] = [];
    let painPoints: string[] = [];
    let conversationStarters: string[] = [];

    if (allSnippets.length > 50) {
      try {
        const claude = await getClaude();
        const analysis = await claude.invoke([
          {
            role: "user",
            content: `Tu es un expert en sales intelligence. Analyse les extraits Google suivants sur ${name}${company ? ` (${company})` : ""} et retourne un JSON avec:
- "interests": tableau de 3 sujets qui semblent intéresser cette personne
- "painPoints": tableau de 2-3 problèmes professionnels probables
- "conversationStarters": tableau de 2 icebreakers personnalisés (<50 mots chacun) basés sur le contenu réel

Extraits:
${allSnippets.substring(0, 2000)}

Réponds UNIQUEMENT avec du JSON valide, sans markdown.`,
          },
        ]);

        const raw = typeof analysis.content === "string" ? analysis.content : JSON.stringify(analysis.content);
        const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
        interests = parsed.interests ?? [];
        painPoints = parsed.painPoints ?? [];
        conversationStarters = parsed.conversationStarters ?? [];
      } catch {
        // NLP échoué, on retourne ce qu'on a sans icebreakers
      }
    }

    logger.info("LinkedIn research terminé", {
      name,
      posts: recentPosts.length,
      achievements: recentAchievements.length,
      hasNlp: conversationStarters.length > 0,
    });

    return { recentPosts, recentAchievements, interests, painPoints, conversationStarters };
  } catch (error) {
    logger.error("Error researching LinkedIn profile", { error: String(error), name });
    return empty;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 GENERATE PERSONALIZED LINKEDIN MESSAGE - Génération de message ultra-personnalisé
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePersonalizedLinkedInMessage(
  input: LinkedInPersonalizationInput
): Promise<PersonalizedLinkedInMessage> {
  const { prospect, sequenceStep, ourOffer, ourCompany, previousMessages = [], connectionAccepted } = input;

  // 1. Recherche approfondie du profil LinkedIn
  let linkedInResearch: any = {};
  if (prospect.linkedInUrl) {
    linkedInResearch = await researchLinkedInProfile(prospect.linkedInUrl, prospect.name, prospect.company);
  }

  // 2. Calcul du score de personnalisation
  let personalizationScore = 0;
  const personalizationPoints: string[] = [];

  if (prospect.jobTitle) {
    personalizationScore += 15;
    personalizationPoints.push(`Job title: ${prospect.jobTitle}`);
  }
  if (prospect.company) {
    personalizationScore += 15;
    personalizationPoints.push(`Company: ${prospect.company}`);
  }
  if (linkedInResearch.recentPosts?.length > 0) {
    personalizationScore += 25;
    personalizationPoints.push(`Recent post: ${linkedInResearch.recentPosts[0].text.substring(0, 50)}...`);
  }
  if (linkedInResearch.recentAchievements?.length > 0) {
    personalizationScore += 20;
    personalizationPoints.push(`Recent achievement: ${linkedInResearch.recentAchievements[0].description}`);
  }
  if (prospect.linkedInProfile?.headline) {
    personalizationScore += 10;
    personalizationPoints.push(`Headline: ${prospect.linkedInProfile.headline}`);
  }
  if (prospect.linkedInProfile?.about) {
    personalizationScore += 15;
    personalizationPoints.push(`About section analyzed`);
  }

  // 3. Génération du message avec GPT-4
  const firstName = prospect.name.split(" ")[0];
  const jobTitle = prospect.jobTitle || "dans votre secteur";
  const company = prospect.company || "";

  // Prompt ultra-personnalisé pour GPT-4 (Top 1%)
  const prompt = `
Tu es un expert en cold outreach LinkedIn B2B avec un taux de réponse de 25%+ (top 1%).

**PROSPECT:**
- Nom: ${prospect.name} (${firstName})
- Entreprise: ${company}
- Poste: ${jobTitle}
${prospect.linkedInProfile?.headline ? `- Headline: ${prospect.linkedInProfile.headline}` : ""}
${prospect.linkedInProfile?.location ? `- Localisation: ${prospect.linkedInProfile.location}` : ""}

**PROFIL LINKEDIN:**
${linkedInResearch.recentPosts?.length > 0 ? `
Posts récents:
${linkedInResearch.recentPosts.slice(0, 3).map((p: any, i: number) => `${i + 1}. ${p.text.substring(0, 200)}...`).join("\n")}
` : ""}
${linkedInResearch.recentAchievements?.length > 0 ? `
Achievements récents:
${linkedInResearch.recentAchievements.slice(0, 2).map((a: any) => `- ${a.type}: ${a.description}`).join("\n")}
` : ""}

**SÉQUENCE:**
Étape ${sequenceStep} sur 5 (multi-step LinkedIn sequence)

${sequenceStep === 1 ? `
**ÉTAPE 1 - DEMANDE DE CONNEXION (MAX 300 caractères):**
- MAX 300 caractères (limite LinkedIn)
- Personnalisation visible dès la première ligne
- Pas de pitch, pas de lien
- Icebreaker basé sur post récent OU achievement OU entreprise
- Question ouverte pour engagement
- Ton: professionnel mais conversationnel

**Exemples Top 1%:**
- "J'ai vu votre post sur [sujet]. Excellente réflexion sur [point spécifique]. Je serais curieux d'échanger sur [question ouverte]."
- "Félicitations pour votre nouveau rôle chez [entreprise] ! J'aimerais comprendre comment vous abordez [défi spécifique]."
- "[Prénom], votre approche de [sujet] m'a marqué. Comment gérez-vous [challenge spécifique] ?"
` : sequenceStep === 2 ? `
**ÉTAPE 2 - FOLLOW-UP APRÈS CONNEXION (3-5 jours après):**
- MAX 300 caractères
- Remerciement pour la connexion
- Référence à la conversation initiale ou au profil
- Partage de valeur légère (insight, ressource)
- Question ouverte
` : sequenceStep === 3 ? `
**ÉTAPE 3 - VALEUR (7-10 jours après):**
- MAX 300 caractères
- Partage d'une ressource concrète (article, cas d'usage, insight)
- Lien avec leur situation (${prospect.jobTitle || "leur rôle"})
- Pas de pitch direct
- Question pour continuer la conversation
` : sequenceStep === 4 ? `
**ÉTAPE 4 - SOFT INTRO (14-17 jours après):**
- MAX 300 caractères
- Introduction douce de notre offre (${ourOffer})
- Lien avec leur pain point spécifique
- Proposition claire mais non-pushy
- CTA léger
` : sequenceStep === 5 ? `
**ÉTAPE 5 - CTA FINAL (21-28 jours après):**
- MAX 300 caractères
- Rappel du contexte
- Proposition de valeur claire (1-2 lignes)
- CTA simple et concret
- Faciliter la réponse ("juste répondre X si intéressé")
` : ""}

**RÈGLES TOP 1% LINKEDIN:**
1. ✅ PERSONNALISATION VISIBLE DÈS LA PREMIÈRE LIGNE
2. ✅ ICEBREAKER UNIQUE (post récent, achievement, ou entreprise)
3. ✅ COURT ET CONCIS (lu en 5 secondes max)
4. ✅ UN SEUL POINT = UN SEUL MESSAGE
5. ✅ TON CONVERSATIONNEL (comme un message entre collègues)
6. ✅ QUESTION OUVERTE pour engagement
7. ✅ PAS DE PITCH avant valeur

**À ÉVITER:**
❌ Templates génériques ("Bonjour, j'aimerais vous connecter...")
❌ Pitch direct dans le message 1
❌ Messages trop longs
❌ Multiple points dans un message
❌ Émoticons excessifs
❌ Liens dans le message (commentaire uniquement)

${previousMessages.length > 0 ? `
**HISTORIQUE:**
Messages précédents envoyés:
${previousMessages.map((m, i) => `- Message ${i + 1}: ${m.content.substring(0, 50)}... (${m.opened ? "Vu" : "Non vu"}, ${m.replied ? "Répondu" : "Non répondu"})`).join("\n")}
${connectionAccepted ? "- Connexion acceptée ✅" : "- Connexion en attente ⏳"}
` : ""}

${linkedInResearch.recentPosts?.length > 0 ? `
**STRATÉGIE RECOMMANDÉE:**
1. Commenter d'abord le post récent "${linkedInResearch.recentPosts[0].text.substring(0, 50)}..."
2. Attendre 24-48h
3. Envoyer la demande de connexion avec référence au commentaire
` : ""}

**SORTIE JSON:**
{
  "content": "Message LinkedIn ultra-personnalisé (MAX 300 caractères)",
  "connectionRequest": "Message de demande de connexion si étape 1",
  "personalizationPoints": ["Point 1", "Point 2", "Point 3"],
  "recommendations": ["Recommandation 1", "Recommandation 2"]
}

IMPORTANT: Génère un message PRÊT À ENVOYER, pas un template. Le contenu doit être complet et personnalisé.
`;

  try {
    const openai = getOpenAI();
    const completion = await openai.invoke(prompt);

    const contentStr =
      typeof completion.content === "string"
        ? completion.content
        : Array.isArray(completion.content)
          ? completion.content
              .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
              .join("")
          : "";
    let messageData: any;
    try {
      // Essayer de parser le JSON
      const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        messageData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      // Fallback: parsing manuel
      messageData = {
        content: extractLinkedInMessage(contentStr),
        connectionRequest: sequenceStep === 1 ? extractLinkedInMessage(contentStr) : undefined,
        personalizationPoints: personalizationPoints,
        recommendations: [],
      };
    }

    // 4. Calcul du temps optimal d'envoi
    const sendTime = calculateOptimalLinkedInSendTime(prospect);

    // 5. Déterminer si warm-up nécessaire
    const warmupRequired = determineWarmupRequired(prospect);

    // 6. Comment-first approach recommandé ?
    const commentFirst = linkedInResearch.recentPosts?.length > 0 && sequenceStep === 1;

    // 7. Recommandations
    const recommendations = generateLinkedInRecommendations(
      prospect,
      linkedInResearch,
      sequenceStep,
      connectionAccepted,
      warmupRequired,
      commentFirst
    );

    return {
      content: messageData.content || generateFallbackLinkedInMessage(input, linkedInResearch),
      connectionRequest: messageData.connectionRequest || (sequenceStep === 1 ? messageData.content : undefined),
      personalizationScore,
      personalizationPoints: messageData.personalizationPoints || personalizationPoints,
      optimalSendTime: sendTime,
      warmupRequired,
      commentFirst,
      recommendations: messageData.recommendations || recommendations,
    };
  } catch (error) {
    console.error("Error generating personalized LinkedIn message:", error);
    // Fallback: génération basique
    return generateFallbackLinkedInMessage(input, linkedInResearch);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 CALCULATE OPTIMAL LINKEDIN SEND TIME - Temps optimal d'envoi LinkedIn
// ═══════════════════════════════════════════════════════════════════════════

function calculateOptimalLinkedInSendTime(prospect: EnrichedLead): Date {
  const now = new Date();
  const timezone = prospect.location ? estimateTimezone(prospect.location) : "UTC";
  
  // Top 1% best times: Mardi-Jeudi, 9-11h locale (meilleur taux de réponse)
  // Alternative: 14-16h locale (deuxième meilleur)
  
  // Convertir au timezone du prospect
  const prospectDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const prospectHour = prospectDate.getHours();
  const prospectDay = prospectDate.getDay(); // 0 = Dimanche, 1 = Lundi, etc.

  // Si c'est Mardi-Jeudi et 9-11h ou 14-16h → Envoyer maintenant
  if (prospectDay >= 2 && prospectDay <= 4) {
    // Mardi-Jeudi
    if ((prospectHour >= 9 && prospectHour <= 11) || (prospectHour >= 14 && prospectHour <= 16)) {
      return now;
    }
    
    // Si trop tôt (< 9h) → Programmer à 9h30
    if (prospectHour < 9) {
      const sendDate = new Date(prospectDate);
      sendDate.setHours(9, 30, 0, 0); // 9h30
      return sendDate;
    }
    
    // Si trop tard (> 16h) → Programmer le lendemain à 9h30
    if (prospectHour >= 16) {
      const sendDate = new Date(prospectDate);
      sendDate.setDate(sendDate.getDate() + 1);
      sendDate.setHours(9, 30, 0, 0);
      return sendDate;
    }
  }

  // Si Lundi ou Vendredi → Programmer Mardi à 9h30
  if (prospectDay === 1 || prospectDay === 5) {
    const daysUntilTuesday = prospectDay === 1 ? 1 : 4; // Lundi → Mardi (1 jour) ou Vendredi → Mardi (4 jours)
    const sendDate = new Date(prospectDate);
    sendDate.setDate(sendDate.getDate() + daysUntilTuesday);
    sendDate.setHours(9, 30, 0, 0);
    return sendDate;
  }

  // Si week-end → Programmer Mardi à 9h30
  if (prospectDay === 0 || prospectDay === 6) {
    const daysUntilTuesday = prospectDay === 0 ? 2 : 3; // Dimanche → Mardi (2 jours) ou Samedi → Mardi (3 jours)
    const sendDate = new Date(prospectDate);
    sendDate.setDate(sendDate.getDate() + daysUntilTuesday);
    sendDate.setHours(9, 30, 0, 0);
    return sendDate;
  }

  // Par défaut: maintenant
  return now;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 DETERMINE WARMUP REQUIRED - Déterminer si warm-up nécessaire
// ═══════════════════════════════════════════════════════════════════════════

function determineWarmupRequired(prospect: EnrichedLead): boolean {
  const connections = prospect.linkedInConnections;

  // Profil bien connecté et actif → pas de warm-up nécessaire
  if (connections && connections >= 500) return false;
  if (connections && connections >= 200) return false;

  // Peu de connexions ou données inconnues → warm-up recommandé
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 💡 GENERATE LINKEDIN RECOMMENDATIONS - Recommandations LinkedIn
// ═══════════════════════════════════════════════════════════════════════════

function generateLinkedInRecommendations(
  prospect: EnrichedLead,
  research: any,
  sequenceStep: number,
  connectionAccepted: boolean | undefined,
  warmupRequired: boolean,
  commentFirst: boolean
): string[] {
  const recommendations: string[] = [];

  // Warm-up recommendations
  if (warmupRequired && sequenceStep === 1) {
    recommendations.push("🔥 Warm-up recommandé avant envoi");
    recommendations.push("- Publier 3-5 posts cette semaine");
    recommendations.push("- Commenter 10-15 posts dans votre secteur");
    recommendations.push("- Accepter les connexions automatiques");
  }

  // Comment-first recommendations
  if (commentFirst && research.recentPosts?.length > 0) {
    recommendations.push("💬 Comment-first approach recommandé");
    recommendations.push(`1. Commenter le post récent: "${research.recentPosts[0].text.substring(0, 50)}..."`);
    recommendations.push("2. Attendre 24-48h");
    recommendations.push("3. Envoyer la demande de connexion avec référence au commentaire");
  }

  // Timing recommendations
  if (sequenceStep === 1) {
    recommendations.push("⏰ Envoyer Mardi-Jeudi, 9-11h (meilleur taux de réponse)");
  }

  // Personalization recommendations
  if (research.recentAchievements?.length > 0) {
    recommendations.push("🎉 Référencer l'achievement récent pour personnalisation");
    recommendations.push(`"${research.recentAchievements[0].description}"`);
  }

  // Follow-up recommendations
  if (connectionAccepted && sequenceStep === 2) {
    recommendations.push("✅ Connexion acceptée - Envoyer follow-up dans 3-5 jours");
    recommendations.push("- Référencer la conversation initiale");
    recommendations.push("- Apporter de la valeur immédiatement");
  }

  // Sequence recommendations
  if (sequenceStep >= 3) {
    recommendations.push("📈 Étape avancée - Maintenir l'engagement");
    recommendations.push("- Continuer à apporter de la valeur");
    recommendations.push("- Ne pas être pushy");
  }

  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function extractLinkedInMessage(content: string): string {
  // Extraire le message LinkedIn
  const jsonMatch = content.match(/"content":\s*"([^"]*)"/);
  if (jsonMatch) {
    return jsonMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').substring(0, 300);
  }
  
  // Fallback: prendre la première phrase
  const firstSentence = content.split(/[.!?]/)[0];
  return firstSentence.substring(0, 300);
}

function estimateTimezone(location: string): string {
  // Estimation basique du timezone depuis la localisation
  const locationLower = location.toLowerCase();
  
  if (locationLower.includes("paris") || locationLower.includes("france")) {
    return "Europe/Paris";
  } else if (locationLower.includes("london") || locationLower.includes("uk")) {
    return "Europe/London";
  } else if (locationLower.includes("new york") || locationLower.includes("usa") || locationLower.includes("united states")) {
    return "America/New_York";
  } else if (locationLower.includes("los angeles") || locationLower.includes("california")) {
    return "America/Los_Angeles";
  } else if (locationLower.includes("berlin") || locationLower.includes("germany")) {
    return "Europe/Berlin";
  }
  
  return "UTC"; // Par défaut
}

function generateFallbackLinkedInMessage(
  input: LinkedInPersonalizationInput,
  research: any
): PersonalizedLinkedInMessage {
  const { prospect, sequenceStep } = input;
  const firstName = prospect.name.split(" ")[0];
  const company = prospect.company || "";
  const jobTitle = prospect.jobTitle || "";

  let content = "";
  let connectionRequest = "";

  if (sequenceStep === 1) {
    if (research.recentPosts?.length > 0) {
      content = `${firstName}, j'ai vu votre post sur ${research.recentPosts[0].text.substring(0, 30)}... Excellente réflexion ! Je serais curieux d'échanger sur ce sujet.`;
    } else if (company) {
      content = `${firstName}, félicitations pour votre rôle chez ${company} ! J'aimerais comprendre comment vous abordez les défis de croissance en tant que ${jobTitle}.`;
    } else {
      content = `${firstName}, votre approche de ${jobTitle} m'a marqué. Comment gérez-vous les défis de votre secteur ?`;
    }
    connectionRequest = content;
  } else if (sequenceStep === 2) {
    content = `${firstName}, merci pour la connexion ! Suite à notre échange précédent, voici une ressource qui pourrait vous intéresser: [article/cas d'usage]. Qu'en pensez-vous ?`;
  } else {
    content = `${firstName}, je souhaitais vous présenter rapidement ${input.ourOffer}. Pensez-vous que cela pourrait convenir à ${company} ?`;
  }

  return {
    content: content.substring(0, 300),
    connectionRequest: connectionRequest.substring(0, 300),
    personalizationScore: 60,
    personalizationPoints: [`Nom: ${prospect.name}`, `Entreprise: ${company}`],
    optimalSendTime: calculateOptimalLinkedInSendTime(prospect),
    warmupRequired: true,
    commentFirst: research.recentPosts?.length > 0 && sequenceStep === 1,
    recommendations: generateLinkedInRecommendations(prospect, research, sequenceStep, false, true, false),
  };
}

