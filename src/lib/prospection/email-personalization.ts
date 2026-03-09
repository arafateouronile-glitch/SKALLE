/**
 * 🎯 Email Personalization Engine - Top 1% Performance
 * 
 * Objectifs Top 1%:
 * - Open rate > 50% (vs 21% moyenne)
 * - Reply rate > 15% (vs 8% moyenne)
 * - Meeting booked rate > 5% (vs 1-2% moyenne)
 * 
 * Optimisations implémentées:
 * - Multi-variant subject line generation (A/B testing)
 * - Deep personalization (job title, company, recent activity)
 * - Optimal send times (timezone + behavioral data)
 * - Snippet optimization (preview text)
 * - Value-first approach (no pitch before value)
 * - Social proof contextuel
 * - Multi-touch sequences (5-7 touches minimum)
 */

import { getOpenAI, getClaude } from "@/lib/ai/langchain";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 UNSUBSCRIBE LINK HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function generateUnsubscribeUrl(email: string, baseUrl?: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret";
  const token = crypto.createHmac("sha256", secret).update(email).digest("hex");
  const base = baseUrl || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/email/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

function unsubscribeFooter(email: string): string {
  const url = generateUnsubscribeUrl(email);
  return `<p style="font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;">
Vous recevez cet email car vous faites partie de notre liste de prospection B2B.
<a href="${url}" style="color:#9ca3af;">Se désabonner</a>
</p>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ProspectData {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  company: string;
  jobTitle?: string | null;
  location?: string | null;
  industry?: string | null;
  linkedInUrl?: string | null;
  timezone?: string | null;
  notes?: string | null;
  enrichmentData?: any;
}

interface ResearchResult {
  recentActivity: string[];
  companyNews: string[];
  jobTitleContext: string;
  painPoints: string[];
  interests: string[];
  socialProof: string[];
  timezone?: string;
}

interface EmailPersonalizationInput {
  prospect: ProspectData;
  sequenceStep: number; // 1-7 (multi-touch)
  ourOffer: string;
  ourCompany: string;
  previousEmails?: Array<{ subject: string; sentAt: Date; opened: boolean; replied: boolean }>;
}

interface PersonalizedEmail {
  subject: string;
  subjectVariants: string[]; // Pour A/B testing
  content: string;
  snippet: string; // Preview text (150 caractères max)
  sendTime: Date; // Optimal send time
  personalizationScore: number; // 0-100
  personalizationPoints: string[]; // Points de personnalisation utilisés
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 RESEARCH PROSPECT - Recherche approfondie du prospect
// ═══════════════════════════════════════════════════════════════════════════

export async function researchProspect(prospect: ProspectData): Promise<ResearchResult> {
  // Recherche approfondie pour personnalisation maximale
  const research: ResearchResult = {
    recentActivity: [],
    companyNews: [],
    jobTitleContext: "",
    painPoints: [],
    interests: [],
    socialProof: [],
  };

  try {
    // Actualités récentes de l'entreprise via Serper
    if (prospect.company && process.env.SERPER_API_KEY) {
      try {
        const serperRes = await fetch("https://google.serper.dev/news", {
          method: "POST",
          headers: {
            "X-API-KEY": process.env.SERPER_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: prospect.company, num: 3, gl: "fr" }),
        });
        if (serperRes.ok) {
          const serperData = await serperRes.json();
          research.companyNews = (serperData.news || [])
            .slice(0, 3)
            .map((item: { title: string }) => item.title);
        }
      } catch {
        // Best-effort — ne bloque pas la personnalisation
      }
    }

    // Analyse du job title pour identifier les pain points
    if (prospect.jobTitle) {
      const jobTitleLower = prospect.jobTitle.toLowerCase();

      if (jobTitleLower.includes("cmo") || jobTitleLower.includes("marketing director") || jobTitleLower.includes("responsable marketing")) {
        research.painPoints = ["Génération de leads qualifiés", "Mesure du ROI marketing", "Accélération du pipeline"];
        research.interests = ["Marketing automation", "ABM", "Content marketing", "Marketing analytics"];
      } else if (jobTitleLower.includes("marketing") || jobTitleLower.includes("growth")) {
        research.painPoints = ["Acquisition client à coût maîtrisé", "Attribution multi-canal", "Scalabilité des campagnes"];
        research.interests = ["Growth hacking", "SEO", "Paid acquisition", "Conversion optimization"];
      } else if (jobTitleLower.includes("ceo") || jobTitleLower.includes("founder") || jobTitleLower.includes("fondateur") || jobTitleLower.includes("président") || jobTitleLower.includes("directeur général")) {
        research.painPoints = ["Croissance scalable", "Optimisation des coûts opérationnels", "Délégation et productivité"];
        research.interests = ["Stratégie de croissance", "Business development", "Revenue optimization", "IA et automatisation"];
      } else if (jobTitleLower.includes("cto") || jobTitleLower.includes("technical") || jobTitleLower.includes("engineering") || jobTitleLower.includes("tech lead")) {
        research.painPoints = ["Dette technique", "Recrutement tech", "Time to market", "Sécurité et scalabilité"];
        research.interests = ["DevOps", "Cloud architecture", "Developer experience", "IA/ML en production"];
      } else if (jobTitleLower.includes("sales") || jobTitleLower.includes("commercial") || jobTitleLower.includes("business development") || jobTitleLower.includes("account")) {
        research.painPoints = ["Qualification des leads", "Outreach efficace à grande échelle", "Taux de conversion", "Cycle de vente long"];
        research.interests = ["Sales automation", "CRM", "Social selling", "Outreach multicanal"];
      } else if (jobTitleLower.includes("cfo") || jobTitleLower.includes("finance") || jobTitleLower.includes("comptab") || jobTitleLower.includes("trésor")) {
        research.painPoints = ["Optimisation des coûts", "Visibilité financière en temps réel", "Conformité et audit"];
        research.interests = ["Finance automation", "BI et reporting", "Gestion de trésorerie", "SaaS finance"];
      } else if (jobTitleLower.includes("rh") || jobTitleLower.includes("drh") || jobTitleLower.includes("human resources") || jobTitleLower.includes("talent") || jobTitleLower.includes("people")) {
        research.painPoints = ["Recrutement rapide", "Rétention des talents", "Engagement des équipes"];
        research.interests = ["HR automation", "Employer branding", "Performance management", "HRIS"];
      } else if (jobTitleLower.includes("ops") || jobTitleLower.includes("opérations") || jobTitleLower.includes("operations") || jobTitleLower.includes("supply chain")) {
        research.painPoints = ["Efficacité opérationnelle", "Automatisation des processus", "Réduction des coûts"];
        research.interests = ["Process automation", "ERP", "Lean management", "KPI tracking"];
      } else if (jobTitleLower.includes("product") || jobTitleLower.includes("cpo") || jobTitleLower.includes("chef de produit")) {
        research.painPoints = ["Product-market fit", "Priorisation du roadmap", "Réduction du time to market"];
        research.interests = ["Product analytics", "User research", "Agile", "Feature prioritization"];
      }
    }

    // Social proof : prospects convertis du même workspace avec industrie similaire
    if (prospect.industry || prospect.company) {
      try {
        const fullProspect = await prisma.prospect.findUnique({
          where: { id: prospect.id },
          select: { workspaceId: true },
        });
        if (fullProspect) {
          const similarClients = await prisma.prospect.findMany({
            where: {
              workspaceId: fullProspect.workspaceId,
              status: "CONVERTED",
              id: { not: prospect.id },
              ...(prospect.industry ? { industry: prospect.industry } : {}),
            },
            select: { company: true },
            take: 3,
          });
          research.socialProof = similarClients.map((c) => c.company);
        }
      } catch {
        // Best-effort
      }
    }

      // Timezone estimation basée sur la localisation
      if (!prospect.timezone && prospect.location) {
        const loc = (prospect.location || "").toLowerCase();
        if (loc.includes("paris") || loc.includes("france") || loc.includes("lyon") || loc.includes("marseille") || loc.includes("bordeaux") || loc.includes("toulouse") || loc.includes("nantes") || loc.includes("lille") || loc.includes("strasbourg")) {
          research.timezone = "Europe/Paris";
        } else if (loc.includes("london") || loc.includes("uk") || loc.includes("united kingdom") || loc.includes("england") || loc.includes("manchester") || loc.includes("birmingham")) {
          research.timezone = "Europe/London";
        } else if (loc.includes("berlin") || loc.includes("germany") || loc.includes("allemagne") || loc.includes("munich") || loc.includes("hambourg") || loc.includes("frankfurt")) {
          research.timezone = "Europe/Berlin";
        } else if (loc.includes("madrid") || loc.includes("barcelona") || loc.includes("espagne") || loc.includes("spain")) {
          research.timezone = "Europe/Madrid";
        } else if (loc.includes("amsterdam") || loc.includes("netherlands") || loc.includes("pays-bas")) {
          research.timezone = "Europe/Amsterdam";
        } else if (loc.includes("brussels") || loc.includes("bruxelles") || loc.includes("belgium") || loc.includes("belgique")) {
          research.timezone = "Europe/Brussels";
        } else if (loc.includes("zürich") || loc.includes("zurich") || loc.includes("suisse") || loc.includes("switzerland") || loc.includes("geneva") || loc.includes("genève")) {
          research.timezone = "Europe/Zurich";
        } else if (loc.includes("new york") || loc.includes("boston") || loc.includes("miami") || loc.includes("atlanta") || loc.includes("toronto") || loc.includes("montreal")) {
          research.timezone = "America/New_York";
        } else if (loc.includes("chicago") || loc.includes("houston") || loc.includes("dallas") || loc.includes("austin")) {
          research.timezone = "America/Chicago";
        } else if (loc.includes("los angeles") || loc.includes("san francisco") || loc.includes("seattle") || loc.includes("portland") || loc.includes("vancouver")) {
          research.timezone = "America/Los_Angeles";
        } else if (loc.includes("dubai") || loc.includes("abu dhabi") || loc.includes("uae")) {
          research.timezone = "Asia/Dubai";
        } else if (loc.includes("singapore") || loc.includes("singapour")) {
          research.timezone = "Asia/Singapore";
        } else if (loc.includes("tokyo") || loc.includes("japon") || loc.includes("japan")) {
          research.timezone = "Asia/Tokyo";
        } else if (loc.includes("sydney") || loc.includes("melbourne") || loc.includes("australia") || loc.includes("australie")) {
          research.timezone = "Australia/Sydney";
        } else {
          research.timezone = "UTC";
        }
      }
      
      return research;
  } catch (error) {
    console.error("Error researching prospect:", error);
  }

  return research;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 GENERATE PERSONALIZED EMAIL - Génération d'email ultra-personnalisé
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePersonalizedEmail(
  input: EmailPersonalizationInput
): Promise<PersonalizedEmail> {
  const { prospect, sequenceStep, ourOffer, ourCompany, previousEmails = [] } = input;

  // 1. Recherche approfondie du prospect
  const research = await researchProspect(prospect);

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
    personalizationScore += 20;
    personalizationPoints.push(`Company news: ${research.companyNews[0]}`);
  }
  if (research.painPoints.length > 0) {
    personalizationScore += 20;
    personalizationPoints.push(`Pain points: ${research.painPoints[0]}`);
  }
  if (research.socialProof.length > 0) {
    personalizationScore += 20;
    personalizationPoints.push(`Social proof: Similar client`);
  }

  // 3. Génération du contenu avec GPT-4
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  const jobTitle = prospect.jobTitle || "dans votre secteur";
  
  // Prompt ultra-personnalisé pour GPT-4
  const prompt = `
Tu es un expert en cold email B2B avec un taux de réponse de 20%+ (top 1%).

**PROSPECT:**
- Nom: ${prospect.name} (${firstName})
- Entreprise: ${prospect.company}
- Poste: ${jobTitle}
${prospect.industry ? `- Industrie: ${prospect.industry}` : ""}
${prospect.location ? `- Localisation: ${prospect.location}` : ""}

**RECHERCHE:**
${research.companyNews.length > 0 ? `- Actualités récentes: ${research.companyNews.join(", ")}` : ""}
${research.painPoints.length > 0 ? `- Pain points identifiés: ${research.painPoints.join(", ")}` : ""}
${research.interests.length > 0 ? `- Intérêts: ${research.interests.join(", ")}` : ""}

**SÉQUENCE:**
Étape ${sequenceStep} sur 7 (multi-touch sequence)

${sequenceStep === 1 ? `
**MESSAGE 1 - VALUE FIRST (Pas de pitch):**
- MAX 125 mots
- Commencer par une valeur concrète ou un insight
- Pas de pitch, pas de lien
- Question ouverte pour engagement
- Ton: professionnel mais conversationnel
` : sequenceStep === 2 ? `
**MESSAGE 2 - SHARE VALUE:**
- MAX 150 mots
- Partager une ressource concrète (article, insight, cas d'usage)
- Lier à leur situation (${research.painPoints[0] || "leurs défis"})
- Question légère pour continuer la conversation
` : sequenceStep === 3 ? `
**MESSAGE 3 - SOFT INTRO:**
- MAX 125 mots
- Introduction douce de notre offre (${ourOffer})
- Lier à leur pain point spécifique
- Proposition claire mais non-pushy
- Faciliter la réponse ("juste répondre X si intéressé")
` : sequenceStep >= 4 ? `
**MESSAGE 4-7 - NURTURING:**
- MAX 100 mots
- Continuer à apporter de la valeur
- Insight, cas d'usage, ou ressource
- Garder le contact chaud
- CTA léger seulement si étape 6-7
` : ""}

**RÈGLES TOP 1%:**
1. ✅ PERSONNALISATION VISIBLE DÈS LA PREMIÈRE LIGNE
2. ✅ VALEUR AVANT TOUT (jamais de pitch avant valeur)
3. ✅ COURT ET CONCIS (lu en 10 secondes max)
4. ✅ UN SEUL CTA
5. ✅ TON CONVERSATIONNEL (comme un email entre collègues)
6. ✅ QUESTION OUVERTE pour engagement

**À ÉVITER:**
❌ Templates génériques
❌ "J'espère que cet email vous trouve bien"
❌ Pitch direct dans les premiers messages
❌ Lien trop tôt dans la séquence
❌ Message trop long
❌ Multiple CTAs

${previousEmails.length > 0 ? `
**HISTORIQUE:**
Emails précédents envoyés:
${previousEmails.map((e, i) => `- Email ${i + 1}: ${e.subject} (${e.opened ? "Ouvert" : "Non ouvert"}, ${e.replied ? "Répondu" : "Non répondu"})`).join("\n")}
` : ""}

**SORTIE JSON:**
{
  "subject": "Subject line ultra-personnalisé (MAX 50 caractères)",
  "subjectVariants": ["Variant 1", "Variant 2", "Variant 3"], // 3 variants pour A/B testing
  "content": "Corps de l'email HTML (avec <p> tags)",
  "snippet": "Preview text optimisé (150 caractères max, visible dans Gmail)",
  "personalizationPoints": ["Point 1", "Point 2", "Point 3"]
}

IMPORTANT: Génère un email PRÊT À ENVOYER, pas un template. Le contenu doit être complet et personnalisé.
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
    let emailData: any;
    try {
      // Essayer de parser le JSON
      const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        emailData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      // Fallback: parsing manuel
      emailData = {
        subject: extractSubject(contentStr),
        subjectVariants: [
          extractSubject(contentStr),
          extractSubject(contentStr, 1),
          extractSubject(contentStr, 2),
        ],
        content: extractContent(contentStr),
        snippet: extractSnippet(contentStr),
        personalizationPoints: personalizationPoints,
      };
    }

    // 4. Calcul du temps optimal d'envoi
    const sendTime = calculateOptimalSendTime(prospect, research);

    // 5. Génération des variants de subject line
    const subjectVariants = await generateSubjectVariants(
      emailData.subject,
      prospect,
      research,
      sequenceStep
    );

    return {
      subject: emailData.subject || `Re: ${prospect.company}`,
      subjectVariants: subjectVariants.length >= 3 ? subjectVariants : [
        emailData.subject || `Re: ${prospect.company}`,
        `${firstName}, quick question about ${prospect.company}`,
        `Thought you'd find this interesting, ${firstName}`,
      ],
      content: emailData.content || generateFallbackEmail(input, research),
      snippet: emailData.snippet || generateSnippet(emailData.content || ""),
      sendTime,
      personalizationScore,
      personalizationPoints: emailData.personalizationPoints || personalizationPoints,
    };
  } catch (error) {
    console.error("Error generating personalized email:", error);
    // Fallback: génération basique
    return generateFallbackPersonalizedEmail(input, research);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 CALCULATE OPTIMAL SEND TIME - Temps optimal d'envoi
// ═══════════════════════════════════════════════════════════════════════════

function calculateOptimalSendTime(
  prospect: ProspectData,
  research: ResearchResult
): Date {
  const now = new Date();
  const timezone = prospect.timezone || research.timezone || "UTC";
  
  // Top 1% best times: Mardi-Jeudi, 9-11h locale (meilleur taux d'ouverture)
  // Alternative: 14-16h locale (deuxième meilleur)
  
  // Convertir au timezone du prospect
  const prospectDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const prospectHour = prospectDate.getHours();
  const prospectDay = prospectDate.getDay(); // 0 = Dimanche, 1 = Lundi, etc.

  // Si c'est Lundi-Vendredi et 9-11h ou 14-16h → Envoyer maintenant
  if (prospectDay >= 1 && prospectDay <= 5) {
    if ((prospectHour >= 9 && prospectHour <= 11) || (prospectHour >= 14 && prospectHour <= 16)) {
      return now;
    }
    
    // Si trop tôt (< 9h) → Programmer à 9h
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

  // Si week-end → Programmer Lundi à 9h30
  if (prospectDay === 0 || prospectDay === 6) {
    const daysUntilMonday = prospectDay === 0 ? 1 : 2;
    const sendDate = new Date(prospectDate);
    sendDate.setDate(sendDate.getDate() + daysUntilMonday);
    sendDate.setHours(9, 30, 0, 0);
    return sendDate;
  }

  // Par défaut: maintenant
  return now;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 GENERATE SUBJECT VARIANTS - Génération de variants pour A/B testing
// ═══════════════════════════════════════════════════════════════════════════

async function generateSubjectVariants(
  baseSubject: string,
  prospect: ProspectData,
  research: ResearchResult,
  sequenceStep: number
): Promise<string[]> {
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  const company = prospect.company;
  const jobTitle = prospect.jobTitle || "";

  // Patterns top 1% subject lines
  const patterns = [
    // Pattern 1: Re: (meilleur open rate)
    `Re: ${company}`,
    
    // Pattern 2: Question personnalisée
    `${firstName}, quick question about ${company}`,
    
    // Pattern 3: Value-first
    `Thought you'd find this interesting, ${firstName}`,
    
    // Pattern 4: Pain point
    `${company} + ${research.painPoints[0] || "growth"}`,
    
    // Pattern 5: Social proof
    `How ${company} could...`,
    
    // Pattern 6: Curiosité
    `Interesting insight about ${jobTitle}`,
    
    // Pattern 7: Direct mais personnel
    `${firstName} — ${company}`,
  ];

  // Retourner les 3 meilleurs selon le step
  if (sequenceStep === 1) {
    return [patterns[0], patterns[1], patterns[2]]; // Re:, Question, Value
  } else if (sequenceStep === 2) {
    return [patterns[2], patterns[3], patterns[4]]; // Value, Pain point, Social proof
  } else {
    return [patterns[5], patterns[6], patterns[0]]; // Curiosité, Direct, Re:
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function extractSubject(content: string, variant = 0): string {
  const lines = content.split("\n");
  const subjectLine = lines.find((line) => line.toLowerCase().includes("subject:") || line.toLowerCase().includes("objet:"));
  if (subjectLine) {
    return subjectLine.split(":")[1]?.trim() || "Re: Quick question";
  }
  return "Re: Quick question";
}

function extractContent(content: string): string {
  // Extraire le corps de l'email
  const jsonMatch = content.match(/"content":\s*"([^"]*)"/);
  if (jsonMatch) {
    return jsonMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  
  // Fallback: prendre tout après "content:" ou "corps:"
  const contentMatch = content.match(/content[:\s]+([\s\S]+?)(?:\n\n|\{)/);
  if (contentMatch) {
    return contentMatch[1].trim();
  }
  
  return content;
}

function extractSnippet(content: string): string {
  // Extraire le snippet (preview text)
  const jsonMatch = content.match(/"snippet":\s*"([^"]*)"/);
  if (jsonMatch) {
    return jsonMatch[1].substring(0, 150);
  }
  
  // Fallback: première phrase du contenu
  const firstSentence = content.split(/[.!?]/)[0];
  return firstSentence.substring(0, 150);
}

function generateSnippet(content: string): string {
  // Générer un snippet optimisé depuis le contenu
  const text = content.replace(/<[^>]*>/g, ""); // Retirer HTML
  const sentences = text.split(/[.!?]/);
  const firstTwoSentences = sentences.slice(0, 2).join(". ");
  return firstTwoSentences.substring(0, 150) + "...";
}

function generateFallbackEmail(
  input: EmailPersonalizationInput,
  research: ResearchResult
): string {
  const { prospect, sequenceStep, ourOffer } = input;
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  const jobTitle = prospect.jobTitle || "dans votre secteur";

  const footer = unsubscribeFooter(prospect.email);

  if (sequenceStep === 1) {
    return `
<p>Bonjour ${firstName},</p>

<p>J'ai vu que ${prospect.company} ${research.companyNews[0] || "est dans un secteur en pleine évolution"}.</p>

<p>En tant que ${jobTitle}, vous faites probablement face à ${research.painPoints[0] || "des défis de croissance"}.</p>

<p>J'aimerais partager avec vous un insight concret sur ce sujet. Seriez-vous ouvert à échanger quelques minutes cette semaine ?</p>

<p>Cordialement,<br>
L'équipe ${input.ourCompany}</p>
${footer}`;
  } else if (sequenceStep === 2) {
    const insight = research.companyNews[0]
      ? `J'ai vu que "${research.companyNews[0]}" — cela illustre bien pourquoi ${research.painPoints[0] || "ce sujet"} est devenu critique pour des équipes comme la vôtre.`
      : `Pour les équipes comme ${prospect.company} qui font face à ${research.painPoints[0] || "ces défis"}, nous avons observé que les meilleures pratiques convergent vers 2-3 leviers clés.`;
    return `
<p>Bonjour ${firstName},</p>

<p>Suite à mon message précédent, voici un élément concret :</p>

<p>${insight}</p>

<p>${research.socialProof.length > 0 ? `Des équipes similaires (${research.socialProof.slice(0, 2).join(", ")}) ont résolu ce problème avec des résultats mesurables.` : "Des entreprises de votre secteur ont résolu ce problème avec des résultats mesurables."}</p>

<p>Pensez-vous que cela pourrait être pertinent pour ${prospect.company} ?</p>

<p>Cordialement,<br>
L'équipe ${input.ourCompany}</p>
${footer}`;
  } else {
    return `
<p>Bonjour ${firstName},</p>

<p>Je souhaitais vous présenter rapidement ${ourOffer}.</p>

<p>${research.socialProof[0] ? `${research.socialProof[0]} et d'autres clients` : "Nos clients"} ont obtenu des résultats concrets en l'utilisant pour ${research.painPoints[0] || "accélérer leur croissance"}.</p>

<p>Seriez-vous disponible pour un échange de 15 minutes afin de voir si cela correspond à vos enjeux actuels ?</p>

<p>Sinon, répondez simplement "Pas maintenant" et je n'insisterai pas.</p>

<p>Cordialement,<br>
L'équipe ${input.ourCompany}</p>
${footer}`;
  }
}

function generateFallbackPersonalizedEmail(
  input: EmailPersonalizationInput,
  research: ResearchResult
): PersonalizedEmail {
  const { prospect, sequenceStep } = input;
  const firstName = prospect.firstName || prospect.name.split(" ")[0];
  
  return {
    subject: `Re: ${prospect.company}`,
    subjectVariants: [
      `Re: ${prospect.company}`,
      `${firstName}, quick question`,
      `Thought you'd find this interesting`,
    ],
    content: generateFallbackEmail(input, research),
    snippet: `J'ai vu que ${prospect.company} — voici pourquoi je vous contacte...`,
    sendTime: calculateOptimalSendTime(prospect, research),
    personalizationScore: 60,
    personalizationPoints: [
      `Nom: ${prospect.name}`,
      `Entreprise: ${prospect.company}`,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export type { PersonalizedEmail, EmailPersonalizationInput, ProspectData };
