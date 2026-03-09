/**
 * 📞 Phone/SMS Sequences Optimization - Top 1% Performance
 * 
 * Objectifs Top 1%:
 * - Call answer rate > 40% (vs 20-25% moyenne)
 * - Voicemail reply rate > 5% (vs 1-2% moyenne)
 * - SMS reply rate > 20% (vs 8-12% moyenne)
 * - Meeting booked via phone > 10% (vs 3-5% moyenne)
 * 
 * Optimisations:
 * - Call scripts AI-personnalisés avec GPT-4
 * - Optimal call times (timezone + behavioral data)
 * - Voicemail drop optimization
 * - SMS follow-up sequences (rappels, value-add)
 * - Local numbers (même indicatif que le lead)
 * - Call tracking & analytics
 */

import { getOpenAI } from "@/lib/ai/langchain";
import { prisma } from "@/lib/prisma";
import { type ProspectData, researchProspect } from "./email-personalization";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PhoneProspectData {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  timezone?: string;
  linkedInUrl?: string;
  notes?: string;
  enrichmentData?: any;
  // Phone-specific data
  phoneVerified?: boolean;
  phoneScore?: number; // Score de confiance (0-100)
  previousCalls?: Array<{
    date: Date;
    outcome: "answered" | "voicemail" | "no_answer" | "busy" | "blocked";
    duration?: number; // Secondes
    notes?: string;
  }>;
}

export interface PersonalizedCallScript {
  script: string; // Script complet de l'appel
  opening: string; // Première phrase (15 secondes max)
  valueProposition: string; // Proposition de valeur (30 secondes max)
  objectionHandling: string[]; // Réponses aux objections communes
  closing: string; // Closing pour booker une réunion
  estimatedDuration: number; // Secondes estimées
  personalizationScore: number; // 0-100
  personalizationPoints: string[];
  recommendations: string[];
}

export interface OptimalCallTime {
  bestDay: string; // "Monday", "Tuesday", etc.
  bestTime: string; // "09:00", "14:00", etc.
  bestTimeRange: { start: string; end: string }; // "09:00-11:00"
  timezone: string;
  confidence: number; // 0-100
  reasoning: string;
}

export interface VoicemailMessage {
  message: string; // Message voicemail (30 secondes max)
  opening: string; // Première phrase (hook)
  callbackNumber: string; // Numéro de rappel
  personalizationScore: number; // 0-100
  personalizationPoints: string[];
  recommendations: string[];
}

export interface PersonalizedSMS {
  message: string; // Message SMS (160 caractères max)
  followUpType: "reminder" | "value_add" | "voicemail_followup" | "meeting_reminder";
  personalizationScore: number; // 0-100
  personalizationPoints: string[];
  optimalSendTime: Date;
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📞 GENERATE PERSONALIZED CALL SCRIPT - Script d'appel AI-personnalisé
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génération de script d'appel ultra-personnalisé (Top 1%)
 * 
 * Top 1% Strategy:
 * - Opening percutant (15 secondes max) - Hook immédiat
 * - Value proposition claire (30 secondes max) - Pas de pitch
 * - Objection handling préparé - Anticipation des objections
 * - Closing doux - Proposer un call court (15 min)
 * - Personnalisation extrême - Utiliser les données du prospect
 */
export async function generatePersonalizedCallScript(
  input: {
    prospect: PhoneProspectData;
    sequenceStep: number;
    ourOffer: string;
    ourCompany: string;
    previousCalls?: Array<{
      date: Date;
      outcome: "answered" | "voicemail" | "no_answer" | "busy" | "blocked";
      duration?: number;
      notes?: string;
    }>;
  }
): Promise<PersonalizedCallScript> {
  const { prospect, sequenceStep, ourOffer, ourCompany, previousCalls = [] } = input;

  // 1. Recherche approfondie du prospect
  const research = await researchProspect({ ...prospect, email: prospect.email ?? "" });

  // 2. Calcul du score de personnalisation
  let personalizationScore = 0;
  const personalizationPoints: string[] = [];

  if (prospect.jobTitle) {
    personalizationScore += 15;
    personalizationPoints.push(`Job title: ${prospect.jobTitle}`);
  }
  if (prospect.company) {
    personalizationScore += 20;
    personalizationPoints.push(`Company: ${prospect.company}`);
  }
  if (research.companyNews.length > 0) {
    personalizationScore += 20;
    personalizationPoints.push(`Company news: ${research.companyNews[0]}`);
  }
  if (research.painPoints.length > 0) {
    personalizationScore += 20;
    personalizationPoints.push(`Pain points: ${research.painPoints[0]}`);
  }
  if (previousCalls.length > 0) {
    personalizationScore += 15;
    personalizationPoints.push(`Previous calls: ${previousCalls.length}`);
  }

  // 3. Génération du script avec GPT-4
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  const jobTitle = prospect.jobTitle || "dans votre secteur";

  const prompt = `
Tu es un expert en cold calling B2B avec un taux de réponse de 40%+ (top 1%).

**PROSPECT:**
- Nom: ${prospect.name}
- Prénom: ${firstName}
- Téléphone: ${prospect.phone}
- Entreprise: ${prospect.company}
- Poste: ${prospect.jobTitle || "Non spécifié"}
- Localisation: ${prospect.location || "Non spécifié"}
- Industrie: ${prospect.industry || "Non spécifié"}
${prospect.linkedInUrl ? `- LinkedIn: ${prospect.linkedInUrl}` : ""}
${prospect.notes ? `- Notes: ${prospect.notes}` : ""}
${prospect.enrichmentData ? `- Données enrichies: ${JSON.stringify(prospect.enrichmentData)}` : ""}

**RECHERCHE EFFECTUÉE:**
${research.recentActivity.length > 0 ? `- Activité récente: ${research.recentActivity.join(", ")}` : ""}
${research.companyNews.length > 0 ? `- Actualités entreprise: ${research.companyNews.join(", ")}` : ""}
${research.painPoints.length > 0 ? `- Points de douleur potentiels: ${research.painPoints.join(", ")}` : ""}
${research.interests.length > 0 ? `- Intérêts: ${research.interests.join(", ")}` : ""}
${research.socialProof.length > 0 ? `- Preuve sociale: ${research.socialProof.join(", ")}` : ""}

**NOTRE OFFRE:**
${ourOffer}

**NOTRE ENTREPRISE:**
${ourCompany}

**ÉTAPE DE LA SÉQUENCE:**
Appel ${sequenceStep}

${previousCalls.length > 0 ? `
**HISTORIQUE DES APPELS PRÉCÉDENTS:**
${previousCalls.map((c, i) => `- Appel ${i + 1} (${c.date.toISOString()}): ${c.outcome}${c.duration ? ` (${c.duration}s)` : ""}${c.notes ? ` - Notes: ${c.notes}` : ""}`).join("\n")}
` : `
**PREMIER APPEL (COLD CALL):**
`}

${sequenceStep === 1 && previousCalls.length === 0 ? `
**SCRIPT PREMIER APPEL (COLD CALL):**
- Durée totale: MAX 60 secondes
- Opening percutant (15 secondes max) - Hook immédiat basé sur personnalisation
- Value proposition claire (30 secondes max) - Pas de pitch, valeur concrète
- Closing doux - Proposer un call court (15 min) pour discuter

**STRUCTURE TOP 1%:**
1. Opening (15s): "Bonjour ${firstName}, c'est [Nom] de ${ourCompany}. J'ai vu que [personnalisation pertinente - actualité, pain point, etc.]. Avez-vous 30 secondes ?"
2. Value Proposition (30s): Apporter une valeur concrète (insight, cas d'usage, ressource) - PAS de pitch produit
3. Objection Handling (si besoin): "Je comprends, c'est pour ça que je propose un call court de 15 minutes pour voir si ça vaut le coup pour vous"
4. Closing (15s): "Seriez-vous ouvert à un call rapide cette semaine pour discuter ? J'ai des créneaux [jour, heure]"

**RÈGLES TOP 1%:**
1. ✅ OPENING PERSONNALISÉ (jamais "J'espère que vous allez bien")
2. ✅ VALEUR AVANT TOUT (pas de pitch avant valeur)
3. ✅ COURT ET CONCIS (60 secondes max)
4. ✅ QUESTION OUVERTE pour engagement
5. ✅ TON CONVERSATIONNEL (comme un appel entre collègues)
6. ✅ PROPOSER UN CALL COURT (15 min, pas de démo)
` : sequenceStep > 1 && previousCalls.some(c => c.outcome === "voicemail") ? `
**SCRIPT SUITE VOICEMAIL:**
- Durée totale: MAX 45 secondes
- Référencer le voicemail précédent
- Nouveau angle de personnalisation
- Value proposition différente
- Closing plus direct
` : sequenceStep > 1 && previousCalls.some(c => c.outcome === "no_answer") ? `
**SCRIPT SUITE NO ANSWER:**
- Durée totale: MAX 45 secondes
- Persistance douce
- Nouveau timing (optimal call time)
- Value proposition renforcée
- Closing plus direct
` : `
**SCRIPT APPEL SUIVANT:**
- Durée totale: MAX 45 secondes
- Rappel du contexte précédent
- Value proposition renforcée
- Closing plus direct
`}

**OBJECTIONS COMMUNES À ANTICIPER:**
1. "Je n'ai pas le temps" → "Je comprends, c'est pour ça que je propose un call court de 15 minutes"
2. "Je ne suis pas intéressé" → "Pas de problème, c'est justement pour voir si ça vaut le coup pour vous"
3. "Envoyez-moi un email" → "Bien sûr, mais un call rapide serait plus efficace - 15 minutes max"
4. "Je ne prends pas de décisions" → "Parfait, qui devrait-je contacter ? Ou préférez-vous que je vous envoie un email à partager ?"

**À ÉVITER:**
❌ "J'espère que vous allez bien"
❌ Pitch produit dans les 30 premières secondes
❌ Appel trop long (> 60 secondes pour cold call)
❌ Être pushy ou désespéré
❌ Ne pas proposer de valeur
❌ Ne pas personnaliser l'opening

**SORTIE JSON:**
{
  "script": "Script complet de l'appel (texte complet, paragraphes séparés)",
  "opening": "Première phrase percutante (15 secondes max)",
  "valueProposition": "Proposition de valeur claire (30 secondes max)",
  "objectionHandling": [
    "Réponse objection 1",
    "Réponse objection 2",
    "Réponse objection 3"
  ],
  "closing": "Closing pour booker une réunion (15 secondes max)",
  "estimatedDuration": 60, // Secondes
  "personalizationPoints": ["Point 1", "Point 2", "Point 3"],
  "recommendations": ["Recommandation 1", "Recommandation 2"]
}

IMPORTANT: Génère un script PRÊT À UTILISER, pas un template. Le script doit être complet et personnalisé.
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
    let scriptData: any;
    try {
      const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scriptData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      // Fallback: parsing manuel
      scriptData = {
        script: contentStr,
        opening: extractOpening(contentStr),
        valueProposition: extractValueProposition(contentStr),
        objectionHandling: [
          "Je comprends, c'est pour ça que je propose un call court de 15 minutes",
          "Pas de problème, c'est justement pour voir si ça vaut le coup pour vous",
          "Bien sûr, mais un call rapide serait plus efficace",
        ],
        closing: extractClosing(contentStr),
        estimatedDuration: 60,
        personalizationPoints: personalizationPoints,
        recommendations: ["Vérifier le script manuellement"],
      };
    }

    return {
      script: scriptData.script || generateFallbackScript(input, research),
      opening: scriptData.opening || `Bonjour ${firstName}, c'est [Nom] de ${ourCompany}.`,
      valueProposition: scriptData.valueProposition || "J'ai vu que vous travaillez sur [personnalisation].",
      objectionHandling: scriptData.objectionHandling || [
        "Je comprends, c'est pour ça que je propose un call court de 15 minutes",
      ],
      closing: scriptData.closing || "Seriez-vous ouvert à un call rapide cette semaine pour discuter ?",
      estimatedDuration: scriptData.estimatedDuration || 60,
      personalizationScore,
      personalizationPoints: scriptData.personalizationPoints || personalizationPoints,
      recommendations: scriptData.recommendations || [
        "Appeler au timing optimal (9-11h, mardi-mercredi)",
        "Utiliser un numéro local (même indicatif que le lead)",
      ],
    };
  } catch (error) {
    console.error("Error generating personalized call script:", error);
    return generateFallbackCallScript(input, research);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🕐 CALCULATE OPTIMAL CALL TIME - Timing optimal d'appel
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcul du timing optimal d'appel (Top 1%)
 * 
 * Top 1% Strategy:
 * - Mardi-Mercredi = Meilleurs jours (35-40% answer rate)
 * - 9h-11h et 14h-16h = Meilleures heures (30-35% answer rate)
 * - Éviter Lundi matin et Vendredi après-midi
 * - Adapter selon timezone du prospect
 * - Utiliser behavioral data (heures d'activité LinkedIn/Email)
 */
export function calculateOptimalCallTime(
  prospect: PhoneProspectData,
  previousCalls?: Array<{
    date: Date;
    outcome: "answered" | "voicemail" | "no_answer" | "busy" | "blocked";
  }>
): OptimalCallTime {
  // Timezone du prospect (défaut: UTC)
  const timezone = prospect.timezone || "UTC";

  // Analyser les appels précédents pour trouver le meilleur timing
  let bestDay = "Tuesday"; // Par défaut: Mardi (meilleur jour selon stats)
  let bestTime = "10:00"; // Par défaut: 10h (meilleure heure selon stats)
  let confidence = 70; // Confiance moyenne par défaut
  let reasoning = "Timing optimal basé sur statistiques moyennes (Mardi 10h)";

  if (previousCalls && previousCalls.length > 0) {
    // Analyser les appels réussis (answered)
    const answeredCalls = previousCalls.filter((c) => c.outcome === "answered");
    if (answeredCalls.length > 0) {
      // Trouver le pattern de timing des appels réussis
      const days = answeredCalls.map((c) => {
        const date = new Date(c.date);
        return date.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone });
      });
      const hours = answeredCalls.map((c) => {
        const date = new Date(c.date);
        return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
      });

      // Trouver le jour le plus fréquent
      const dayCounts: Record<string, number> = {};
      days.forEach((day) => {
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });
      const mostFrequentDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (mostFrequentDay) {
        bestDay = mostFrequentDay;
      }

      // Trouver l'heure moyenne des appels réussis
      const avgHour = hours.reduce((sum, h) => {
        const hour = parseInt(h.split(":")[0]);
        return sum + hour;
      }, 0) / hours.length;
      bestTime = `${Math.round(avgHour)}:00`;

      confidence = Math.min(95, 70 + answeredCalls.length * 5); // Augmenter confiance avec plus de données
      reasoning = `Timing optimal basé sur ${answeredCalls.length} appels réussis précédents`;
    }
  }

  // Statistiques Top 1% par défaut
  const statsBestDays = ["Tuesday", "Wednesday", "Thursday"];
  const statsBestHours = [9, 10, 11, 14, 15, 16]; // 9-11h et 14-16h

  if (!previousCalls || previousCalls.length === 0) {
    // Utiliser les statistiques moyennes Top 1%
    bestDay = statsBestDays[1]; // Mardi
    bestTime = "10:00"; // 10h
    confidence = 75; // Bonne confiance pour stats moyennes
    reasoning = "Timing optimal basé sur statistiques Top 1% (Mardi 10h = 35-40% answer rate)";
  }

  // Meilleure plage horaire
  const bestTimeRange = {
    start: bestTime,
    end: `${parseInt(bestTime.split(":")[0]) + 2}:00`, // +2 heures
  };

  return {
    bestDay,
    bestTime,
    bestTimeRange,
    timezone,
    confidence,
    reasoning,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 GENERATE VOICEMAIL MESSAGE - Message voicemail optimisé
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génération de message voicemail ultra-personnalisé (Top 1%)
 * 
 * Top 1% Strategy:
 * - Durée MAX 30 secondes (voicemail typique = 15-20 secondes)
 * - Opening percutant (hook immédiat)
 * - Value proposition claire (pas de pitch)
 * - Callback number clair (répéter 2x)
 * - Personnalisation extrême
 */
export async function generateVoicemailMessage(
  input: {
    prospect: PhoneProspectData;
    callbackNumber: string;
    ourOffer: string;
    ourCompany: string;
  }
): Promise<VoicemailMessage> {
  const { prospect, callbackNumber, ourOffer, ourCompany } = input;

  // 1. Recherche approfondie du prospect
  const research = await researchProspect({ ...prospect, email: prospect.email ?? "" });

  // 2. Calcul du score de personnalisation
  let personalizationScore = 0;
  const personalizationPoints: string[] = [];

  if (prospect.jobTitle) {
    personalizationScore += 20;
    personalizationPoints.push(`Job title: ${prospect.jobTitle}`);
  }
  if (prospect.company) {
    personalizationScore += 20;
    personalizationPoints.push(`Company: ${prospect.company}`);
  }
  if (research.companyNews.length > 0) {
    personalizationScore += 25;
    personalizationPoints.push(`Company news: ${research.companyNews[0]}`);
  }
  if (research.painPoints.length > 0) {
    personalizationScore += 25;
    personalizationPoints.push(`Pain points: ${research.painPoints[0]}`);
  }

  // 3. Génération du message avec GPT-4
  const firstName = prospect.firstName || prospect.name.split(" ")[0];

  const prompt = `
Tu es un expert en voicemail B2B avec un taux de réponse de 5%+ (top 1%).

**PROSPECT:**
- Nom: ${prospect.name}
- Prénom: ${firstName}
- Entreprise: ${prospect.company}
- Poste: ${prospect.jobTitle || "Non spécifié"}

**RECHERCHE:**
${research.companyNews.length > 0 ? `- Actualités entreprise: ${research.companyNews.join(", ")}` : ""}
${research.painPoints.length > 0 ? `- Points de douleur: ${research.painPoints.join(", ")}` : ""}

**NOTRE OFFRE:**
${ourOffer}

**NOTRE ENTREPRISE:**
${ourCompany}

**NUMÉRO DE RAPPEL:**
${callbackNumber}

**RÈGLES TOP 1% VOICEMAIL:**
1. ✅ DURÉE MAX 30 SECONDES (idéalement 15-20 secondes)
2. ✅ OPENING PERCUTANT (hook immédiat, personnalisation visible)
3. ✅ VALEUR AVANT TOUT (pas de pitch, valeur concrète)
4. ✅ CALLBACK NUMBER CLAIR (répéter 2x: début et fin)
5. ✅ TON CONVERSATIONNEL (comme un message pour un collègue)
6. ✅ QUESTION OUVERTE pour engagement

**STRUCTURE TOP 1%:**
1. Opening (5s): "Bonjour ${firstName}, c'est [Nom] de ${ourCompany}."
2. Hook (5s): "J'ai vu que [personnalisation pertinente - actualité, pain point]."
3. Value Proposition (10s): "Je voulais vous partager [valeur concrète - insight, ressource, cas d'usage]."
4. CTA (5s): "Appelez-moi au ${callbackNumber} si ça vous intéresse. ${callbackNumber}."
5. Closing (5s): "À bientôt, ${firstName}."

**À ÉVITER:**
❌ Message trop long (> 30 secondes)
❌ Pitch produit
❌ Ne pas répéter le numéro de callback
❌ Ton trop formel ou robotique
❌ Ne pas personnaliser

**SORTIE JSON:**
{
  "message": "Message voicemail complet (texte, MAX 30 secondes à lire)",
  "opening": "Première phrase (hook, 5 secondes max)",
  "personalizationPoints": ["Point 1", "Point 2"],
  "recommendations": ["Recommandation 1", "Recommandation 2"]
}

IMPORTANT: Génère un message PRÊT À UTILISER, pas un template.
`;

  try {
    const openai = getOpenAI();
    const completion = await openai.invoke(prompt);

    const contentStrVm =
      typeof completion.content === "string"
        ? completion.content
        : Array.isArray(completion.content)
          ? completion.content
              .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
              .join("")
          : "";
    let voicemailData: any;
    try {
      const jsonMatch = contentStrVm.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        voicemailData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      // Fallback
      voicemailData = {
        message: `Bonjour ${firstName}, c'est [Nom] de ${ourCompany}. J'ai vu que ${prospect.company} travaille sur [personnalisation]. Je voulais vous partager [valeur]. Appelez-moi au ${callbackNumber} si ça vous intéresse. ${callbackNumber}. À bientôt.`,
        opening: `Bonjour ${firstName}, c'est [Nom] de ${ourCompany}.`,
        personalizationPoints: personalizationPoints,
        recommendations: ["Vérifier le message manuellement"],
      };
    }

    return {
      message: voicemailData.message || generateFallbackVoicemail(input, research, callbackNumber),
      opening: voicemailData.opening || `Bonjour ${firstName}, c'est [Nom] de ${ourCompany}.`,
      callbackNumber,
      personalizationScore,
      personalizationPoints: voicemailData.personalizationPoints || personalizationPoints,
      recommendations: voicemailData.recommendations || [
        "S'assurer que le message fait MAX 30 secondes",
        "Répéter le numéro de callback 2x",
      ],
    };
  } catch (error) {
    console.error("Error generating voicemail message:", error);
    const fallbackMsg = generateFallbackVoicemail(input, research, callbackNumber);
    return {
      message: fallbackMsg,
      opening: fallbackMsg.split(".")[0] ?? fallbackMsg,
      callbackNumber,
      personalizationScore: 0,
      personalizationPoints: [],
      recommendations: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 GENERATE PERSONALIZED SMS - SMS personnalisé
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génération de SMS ultra-personnalisé (Top 1%)
 * 
 * Top 1% Strategy:
 * - MAX 160 caractères (1 SMS)
 * - Personnalisation visible dès la première phrase
 * - Value proposition claire
 * - CTA simple (lien ou rappel)
 * - Timing optimal (9h-17h, mardi-mercredi)
 */
export async function generatePersonalizedSMS(
  input: {
    prospect: PhoneProspectData;
    followUpType: "reminder" | "value_add" | "voicemail_followup" | "meeting_reminder";
    ourOffer: string;
    ourCompany: string;
    previousCalls?: Array<{
      date: Date;
      outcome: "answered" | "voicemail" | "no_answer" | "busy" | "blocked";
    }>;
  }
): Promise<PersonalizedSMS> {
  const { prospect, followUpType, ourOffer, ourCompany, previousCalls = [] } = input;

  // 1. Recherche approfondie du prospect
  const research = await researchProspect({ ...prospect, email: prospect.email ?? "" });

  // 2. Calcul du score de personnalisation
  let personalizationScore = 0;
  const personalizationPoints: string[] = [];

  if (prospect.jobTitle) {
    personalizationScore += 20;
    personalizationPoints.push(`Job title: ${prospect.jobTitle}`);
  }
  if (prospect.company) {
    personalizationScore += 20;
    personalizationPoints.push(`Company: ${prospect.company}`);
  }
  if (research.companyNews.length > 0) {
    personalizationScore += 25;
    personalizationPoints.push(`Company news: ${research.companyNews[0]}`);
  }
  if (research.painPoints.length > 0) {
    personalizationScore += 25;
    personalizationPoints.push(`Pain points: ${research.painPoints[0]}`);
  }

  // 3. Génération du message avec GPT-4
  const firstName = prospect.firstName || prospect.name.split(" ")[0];

  const followUpTypeText = {
    reminder: "Rappel d'appel",
    value_add: "Valeur ajoutée (insight, ressource)",
    voicemail_followup: "Suite voicemail",
    meeting_reminder: "Rappel réunion",
  }[followUpType];

  const prompt = `
Tu es un expert en SMS B2B avec un taux de réponse de 20%+ (top 1%).

**PROSPECT:**
- Nom: ${prospect.name}
- Prénom: ${firstName}
- Entreprise: ${prospect.company}
- Poste: ${prospect.jobTitle || "Non spécifié"}

**TYPE DE SMS:**
${followUpTypeText}

**RECHERCHE:**
${research.companyNews.length > 0 ? `- Actualités entreprise: ${research.companyNews.join(", ")}` : ""}
${research.painPoints.length > 0 ? `- Points de douleur: ${research.painPoints.join(", ")}` : ""}

**NOTRE OFFRE:**
${ourOffer}

**NOTRE ENTREPRISE:**
${ourCompany}

${previousCalls.length > 0 ? `
**HISTORIQUE APPELS:**
${previousCalls.map((c, i) => `- Appel ${i + 1}: ${c.outcome}`).join("\n")}
` : ""}

**RÈGLES TOP 1% SMS:**
1. ✅ MAX 160 CARACTÈRES (1 SMS, pas de split)
2. ✅ PERSONNALISATION VISIBLE dès la première phrase
3. ✅ VALEUR AVANT TOUT (pas de pitch)
4. ✅ CTA SIMPLE (lien court ou rappel)
5. ✅ TON CONVERSATIONNEL (comme un SMS entre collègues)
6. ✅ PAS D'EMOJI (sauf si très pertinent)

**STRUCTURE TOP 1%:**
${followUpType === "reminder" ? `
- Opening: "Bonjour ${firstName},"
- Context: "J'ai essayé de vous joindre [jour] à propos de [personnalisation]."
- Value: "J'ai [valeur concrète] qui pourrait vous intéresser."
- CTA: "Disponible pour un call rapide ? [Lien calendrier]"
` : followUpType === "value_add" ? `
- Opening: "Bonjour ${firstName},"
- Value: "J'ai vu que [personnalisation] - voici [valeur concrète]: [Lien ressource]"
- CTA: "Ça vous intéresse ?"
` : followUpType === "voicemail_followup" ? `
- Opening: "Bonjour ${firstName},"
- Context: "Suite à mon message vocal à propos de [personnalisation]."
- Value: "[Valeur concrète] qui pourrait vous intéresser."
- CTA: "Disponible pour un call ? [Lien calendrier]"
` : `
- Opening: "Bonjour ${firstName},"
- Context: "Rappel: notre réunion [date, heure] à propos de [sujet]."
- CTA: "Confirmé ? Sinon, on peut décaler."
`}

**À ÉVITER:**
❌ Message trop long (> 160 caractères)
❌ Templates génériques
❌ Pitch produit
❌ Trop d'emoji
❌ Ne pas personnaliser

**SORTIE JSON:**
{
  "message": "Message SMS complet (MAX 160 caractères)",
  "personalizationPoints": ["Point 1", "Point 2"],
  "recommendations": ["Recommandation 1", "Recommandation 2"]
}

IMPORTANT: Génère un message PRÊT À ENVOYER, MAX 160 caractères.
`;

  try {
    const openai = getOpenAI();
    const completion = await openai.invoke(prompt);

    const contentStrSms =
      typeof completion.content === "string"
        ? completion.content
        : Array.isArray(completion.content)
          ? completion.content
              .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
              .join("")
          : "";
    let smsData: any;
    try {
      const jsonMatch = contentStrSms.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        smsData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      // Fallback
      smsData = {
        message: `Bonjour ${firstName}, j'ai vu que ${prospect.company} travaille sur [personnalisation]. J'ai [valeur] qui pourrait vous intéresser. Disponible pour un call ?`,
        personalizationPoints: personalizationPoints,
        recommendations: ["Vérifier le message manuellement"],
      };
    }

    // Vérifier la longueur (MAX 160 caractères)
    let message = smsData.message || generateFallbackSMS(input, research);
    if (message.length > 160) {
      message = message.substring(0, 157) + "...";
    }

    // Calculer le timing optimal
    const optimalTime = calculateOptimalCallTime(prospect, previousCalls);
    const sendTime = new Date();
    sendTime.setHours(parseInt(optimalTime.bestTime.split(":")[0]), 0, 0, 0);

    return {
      message,
      followUpType,
      personalizationScore,
      personalizationPoints: smsData.personalizationPoints || personalizationPoints,
      optimalSendTime: sendTime,
      recommendations: smsData.recommendations || [
        "Envoyer au timing optimal (9h-11h ou 14h-16h, mardi-mercredi)",
        "Utiliser un numéro local (même indicatif que le lead)",
      ],
    };
  } catch (error) {
    console.error("Error generating personalized SMS:", error);
    const fallbackMsg = generateFallbackSMS(input, research);
    const sendTime = new Date();
    sendTime.setHours(14, 0, 0, 0);
    return {
      message: fallbackMsg,
      followUpType: input.followUpType,
      personalizationScore: 0,
      personalizationPoints: [],
      optimalSendTime: sendTime,
      recommendations: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function extractOpening(text: string): string {
  const lines = text.split("\n");
  const firstLine = lines.find((l) => l.trim().length > 0);
  return firstLine?.trim().substring(0, 100) || "";
}

function extractValueProposition(text: string): string {
  // Chercher des phrases avec "valeur", "intérêt", "bénéfice", etc.
  const sentences = text.split(/[.!?]/);
  const valueSentence = sentences.find((s) =>
    /valeur|intérêt|bénéfice|aide|solution/i.test(s)
  );
  return valueSentence?.trim().substring(0, 150) || "";
}

function extractClosing(text: string): string {
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1];
  return lastLine?.trim().substring(0, 100) || "";
}

function generateFallbackScript(
  input: {
    prospect: PhoneProspectData;
    ourOffer: string;
    ourCompany: string;
  },
  research: any
): string {
  const { prospect, ourOffer, ourCompany } = input;
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  
  return `Bonjour ${firstName}, c'est [Nom] de ${ourCompany}.

J'ai vu que ${prospect.company} travaille sur ${research.companyNews[0] || "vos projets"}.

J'ai ${ourOffer} qui pourrait vous intéresser.

Seriez-vous ouvert à un call rapide de 15 minutes cette semaine pour discuter ?`;
}

function generateFallbackCallScript(
  input: {
    prospect: PhoneProspectData;
    ourOffer: string;
    ourCompany: string;
  },
  research: any
): PersonalizedCallScript {
  const firstName = input.prospect.firstName || input.prospect.name.split(" ")[0];
  
  return {
    script: generateFallbackScript(input, research),
    opening: `Bonjour ${firstName}, c'est [Nom] de ${input.ourCompany}.`,
    valueProposition: `J'ai vu que ${input.prospect.company} travaille sur ${research.companyNews[0] || "vos projets"}.`,
    objectionHandling: [
      "Je comprends, c'est pour ça que je propose un call court de 15 minutes",
    ],
    closing: "Seriez-vous ouvert à un call rapide cette semaine ?",
    estimatedDuration: 60,
    personalizationScore: 0,
    personalizationPoints: [],
    recommendations: ["Vérifier le script manuellement"],
  };
}

function generateFallbackVoicemail(
  input: {
    prospect: PhoneProspectData;
    ourOffer: string;
    ourCompany: string;
  },
  research: any,
  callbackNumber: string
): string {
  const { prospect, ourCompany } = input;
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  
  return `Bonjour ${firstName}, c'est [Nom] de ${ourCompany}.

J'ai vu que ${prospect.company} travaille sur ${research.companyNews[0] || "vos projets"}.

Je voulais vous partager ${input.ourOffer}.

Appelez-moi au ${callbackNumber} si ça vous intéresse. ${callbackNumber}.

À bientôt, ${firstName}.`;
}

function generateFallbackSMS(
  input: {
    prospect: PhoneProspectData;
    ourOffer: string;
  },
  research: any
): string {
  const { prospect } = input;
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  
  return `Bonjour ${firstName}, j'ai vu que ${prospect.company} travaille sur ${research.companyNews[0] || "vos projets"}. J'ai ${input.ourOffer} qui pourrait vous intéresser. Disponible pour un call ?`;
}

