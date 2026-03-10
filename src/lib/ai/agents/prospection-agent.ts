/**
 * 🎯 Prospection Agent - Agent Autonome de Prospection LinkedIn
 * 
 * Cet agent peut:
 * - Analyser un profil LinkedIn
 * - Rechercher des informations sur l'entreprise
 * - Générer des séquences de messages ultra-personnalisées
 * - Adapter le ton et l'approche selon le prospect
 * - Suggérer le meilleur timing
 */

import { createAgent, AgentResult } from "./base-agent";
import { webSearchTool, webScraperTool, linkedinProfileTool } from "../tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ OUTILS SPÉCIALISÉS PROSPECTION
// ═══════════════════════════════════════════════════════════════════════════

const analyzeProspectTool = new DynamicStructuredTool({
  name: "analyze_prospect",
  description: "Analyse en profondeur un prospect pour personnaliser l'approche.",
  schema: z.object({
    name: z.string(),
    company: z.string(),
    jobTitle: z.string(),
    linkedInUrl: z.string().optional(),
    additionalInfo: z.string().optional(),
  }),
  func: async ({ name, company, jobTitle, linkedInUrl, additionalInfo }) => {
    // Analyse du titre pour déterminer le niveau hiérarchique
    const seniorityKeywords = {
      cLevel: ["ceo", "cto", "cfo", "coo", "chief", "président", "president"],
      director: ["director", "directeur", "vp", "vice president", "head of"],
      manager: ["manager", "responsable", "lead", "team lead"],
      individual: ["specialist", "analyst", "consultant", "developer", "designer"],
    };

    const titleLower = jobTitle.toLowerCase();
    let seniority = "individual";
    for (const [level, keywords] of Object.entries(seniorityKeywords)) {
      if (keywords.some(k => titleLower.includes(k))) {
        seniority = level;
        break;
      }
    }

    // Déterminer le département
    const departmentKeywords = {
      marketing: ["marketing", "growth", "brand", "content", "seo", "acquisition"],
      sales: ["sales", "commercial", "business development", "account"],
      tech: ["tech", "engineering", "developer", "cto", "it", "data"],
      hr: ["hr", "human resources", "talent", "people", "recruitment"],
      finance: ["finance", "cfo", "accounting", "controller"],
      operations: ["operations", "coo", "logistics", "supply chain"],
    };

    let department = "general";
    for (const [dept, keywords] of Object.entries(departmentKeywords)) {
      if (keywords.some(k => titleLower.includes(k))) {
        department = dept;
        break;
      }
    }

    // Recommandations de personnalisation
    const personalizationHints = {
      cLevel: "Focus sur ROI, vision stratégique, impact business",
      director: "Métriques, résultats concrets, études de cas",
      manager: "Efficacité opérationnelle, gains de temps, outils",
      individual: "Compétences, apprentissage, évolution carrière",
    };

    return JSON.stringify({
      prospect: { name, company, jobTitle },
      analysis: {
        seniority,
        department,
        decisionMaker: seniority === "cLevel" || seniority === "director",
        personalizationApproach: personalizationHints[seniority as keyof typeof personalizationHints],
      },
      suggestedTone: seniority === "cLevel" ? "Très professionnel et concis" : 
                     seniority === "individual" ? "Amical et pair-à-pair" : "Professionnel mais accessible",
      suggestedHooks: [
        `Félicitations pour votre rôle chez ${company}`,
        `J'ai vu que ${company} travaille sur...`,
        `En tant que ${jobTitle}, vous devez gérer...`,
      ],
    });
  },
});

const researchCompanyTool = new DynamicStructuredTool({
  name: "research_company",
  description: "Recherche des informations récentes sur l'entreprise du prospect.",
  schema: z.object({
    companyName: z.string(),
    focusAreas: z.array(z.string()).optional().describe("Domaines à rechercher: news, funding, products, hiring"),
  }),
  func: async ({ companyName, focusAreas = ["news", "products"] }) => {
    // Simulé - en production, utiliser webSearchTool
    return JSON.stringify({
      company: companyName,
      searchedAreas: focusAreas,
      tips: [
        "Mentionnez une actualité récente de l'entreprise",
        "Référencez un produit ou service spécifique",
        "Si levée de fonds récente, félicitez",
        "Si recrutement actif, mentionnez la croissance",
      ],
      suggestedMentions: [
        `J'ai vu que ${companyName} se développe dans...`,
        `Votre dernière actualité sur... m'a interpellé`,
        `L'approche de ${companyName} concernant... est intéressante`,
      ],
    });
  },
});

const generateProspectionSequenceTool = new DynamicStructuredTool({
  name: "generate_prospection_sequence",
  description: "Génère une séquence de messages de prospection ultra-personnalisée.",
  schema: z.object({
    prospectName: z.string(),
    company: z.string(),
    jobTitle: z.string(),
    personalizationPoints: z.array(z.string()).describe("Points de personnalisation identifiés"),
    ourOffer: z.string().describe("Notre offre/proposition de valeur"),
    tone: z.enum(["formal", "professional", "friendly", "casual"]),
  }),
  func: async ({ prospectName, company, jobTitle, personalizationPoints, ourOffer, tone }) => {
    const firstName = prospectName.split(" ")[0];

    // Templates par ton
    const templates = {
      formal: {
        salutation: `Bonjour ${firstName},`,
        closing: "Cordialement,",
      },
      professional: {
        salutation: `Bonjour ${firstName},`,
        closing: "À bientôt,",
      },
      friendly: {
        salutation: `Hello ${firstName} 👋`,
        closing: "À très vite !",
      },
      casual: {
        salutation: `Hey ${firstName}!`,
        closing: "Cheers 🙌",
      },
    };

    const template = templates[tone];

    // Structure des 3 messages
    const sequence = {
      message1_connection: {
        type: "Connection Request / Approche",
        timing: "Jour 0",
        structure: [
          template.salutation,
          "• Hook personnalisé (1-2 lignes)",
          "• Raison du contact (pas de pitch)",
          "• Question ouverte OU compliment sincère",
          template.closing,
        ],
        maxLength: 300,
        doNot: ["Pitcher", "Parler de soi", "Demander un call direct"],
      },
      message2_value: {
        type: "Valeur / Nurturing",
        timing: "Jour 3-5 après acceptation",
        structure: [
          template.salutation,
          "• Remerciement pour la connexion",
          "• Partage de valeur (article, insight, ressource)",
          "• Lien avec leur activité",
          "• Question légère",
          template.closing,
        ],
        maxLength: 500,
        doNot: ["Être pushy", "Demander trop tôt"],
      },
      message3_cta: {
        type: "Call-to-Action",
        timing: "Jour 7-10",
        structure: [
          template.salutation,
          "• Rappel du contexte",
          "• Proposition de valeur claire (1-2 lignes)",
          "• CTA simple et concret",
          "• Faciliter la réponse (ex: 'juste répondre X si intéressé')",
          template.closing,
        ],
        maxLength: 400,
        doNot: ["Être désespéré", "Multiple CTA", "Message trop long"],
      },
    };

    return JSON.stringify({
      prospect: { name: prospectName, company, jobTitle },
      personalizationPoints,
      tone,
      sequence,
      generalTips: [
        "Chaque message doit pouvoir être lu en 10 secondes",
        "Personnalisation > Template générique",
        "Toujours apporter de la valeur avant de demander",
        "Un CTA clair = un seul CTA",
      ],
    });
  },
});

const saveProspectMessagesTool = new DynamicStructuredTool({
  name: "save_prospect_messages",
  description: "Sauvegarde les messages générés pour un prospect.",
  schema: z.object({
    prospectId: z.string(),
    messages: z.object({
      message1: z.string(),
      message2: z.string(),
      message3: z.string(),
    }),
  }),
  func: async ({ prospectId, messages }) => {
    try {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { 
          messages: JSON.parse(JSON.stringify(messages)),
          status: "CONTACTED",
        },
      });
      return JSON.stringify({ success: true, prospectId });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  },
});

const updateProspectStatusTool = new DynamicStructuredTool({
  name: "update_prospect_status",
  description: "Met à jour le statut d'un prospect.",
  schema: z.object({
    prospectId: z.string(),
    status: z.enum(["NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED", "RESPONDED", "MEETING_BOOKED", "CONVERTED", "LOST"]),
    notes: z.string().optional(),
  }),
  func: async ({ prospectId, status, notes }) => {
    try {
      const updateData: Record<string, unknown> = { status };
      if (notes) {
        const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
        updateData.notes = prospect?.notes ? `${prospect.notes}\n\n${notes}` : notes;
      }
      
      await prisma.prospect.update({
        where: { id: prospectId },
        data: updateData,
      });
      return JSON.stringify({ success: true, prospectId, newStatus: status });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 PROSPECTION AGENT - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PROSPECTION_AGENT_PROMPT = `Tu es un expert en prospection LinkedIn B2B et cold outreach chez Skalle.

🎯 TA MISSION:
Générer des séquences de prospection hyper-personnalisées qui convertissent.

📋 TON PROCESSUS:

1. **ANALYSE DU PROSPECT**
   - Utilise \`analyze_prospect\` pour comprendre le profil
   - Identifie le niveau hiérarchique et le département
   - Détermine le ton approprié

2. **RECHERCHE ENTREPRISE**
   - Utilise \`web_search\` pour trouver des actualités récentes
   - Utilise \`research_company\` pour des insights
   - Note 2-3 points de personnalisation uniques

3. **GÉNÉRATION DES MESSAGES**
   - Utilise \`generate_prospection_sequence\` pour la structure
   - Rédige les 3 messages complets et personnalisés
   - Chaque message doit être prêt à copier-coller

4. **SAUVEGARDE**
   - Utilise \`save_prospect_messages\` pour enregistrer

📝 RÈGLES D'OR DU COLD OUTREACH:

**Message 1 (Connexion):**
- MAX 300 caractères
- Pas de pitch, pas de lien
- Personnalisation visible dès la première ligne
- Question ou compliment sincère

**Message 2 (Valeur):**
- Apporte quelque chose de concret (article, insight)
- Montre que tu comprends leurs défis
- Reste conversationnel

**Message 3 (CTA):**
- Proposition claire et simple
- Un seul CTA
- Facilite la réponse ("juste répondre X si...")

🚫 NE JAMAIS:
- Utiliser des templates génériques
- Pitcher dans le message 1
- Écrire des messages trop longs
- Oublier de personnaliser
- Être pushy ou désespéré

Notre offre: ${process.env.COMPANY_OFFER || "Solutions marketing automatisées avec IA pour accélérer la croissance"}`;

export const prospectionAgent = createAgent({
  name: "Prospection Agent",
  description: "Agent spécialisé dans la génération de séquences de prospection LinkedIn",
  systemPrompt: PROSPECTION_AGENT_PROMPT,
  tools: [
    analyzeProspectTool,
    researchCompanyTool,
    generateProspectionSequenceTool,
    webSearchTool,
    linkedinProfileTool,
    saveProspectMessagesTool,
    updateProspectStatusTool,
  ],
  model: "claude-3-5-sonnet", // Claude est meilleur pour le copywriting
  maxIterations: 6,
  temperature: 0.7,
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 FONCTIONS D'EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface ProspectionAgentInput {
  prospectId?: string; // Si prospect existe déjà en DB
  prospect: {
    name: string;
    company: string;
    jobTitle: string;
    linkedInUrl?: string;
    notes?: string;
  };
  ourOffer?: string;
  preferredTone?: "formal" | "professional" | "friendly" | "casual";
}

export async function runProspectionAgent(input: ProspectionAgentInput): Promise<AgentResult> {
  const { 
    prospectId, 
    prospect, 
    ourOffer = "Solutions marketing automatisées avec IA",
    preferredTone = "professional"
  } = input;

  const prompt = `
Génère une séquence de prospection LinkedIn pour:

**PROSPECT:**
- Nom: ${prospect.name}
- Entreprise: ${prospect.company}
- Poste: ${prospect.jobTitle}
${prospect.linkedInUrl ? `- LinkedIn: ${prospect.linkedInUrl}` : ""}
${prospect.notes ? `- Notes: ${prospect.notes}` : ""}

${prospectId ? `- ID Prospect (pour sauvegarde): ${prospectId}` : ""}

**NOTRE OFFRE:**
${ourOffer}

**TON PRÉFÉRÉ:**
${preferredTone}

**INSTRUCTIONS:**
1. Analyse d'abord le prospect pour comprendre son contexte
2. Recherche des actualités récentes sur ${prospect.company}
3. Identifie 2-3 points de personnalisation uniques
4. Génère les 3 messages de la séquence, prêts à être copiés
${prospectId ? "5. Sauvegarde les messages générés" : ""}

IMPORTANT: Rédige les messages complets, pas juste la structure. Chaque message doit être directement utilisable.
`;

  const result = await prospectionAgent.run(prompt, { prospectId, prospect });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 BULK PROSPECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function runBulkProspectionAgent(
  prospects: ProspectionAgentInput["prospect"][],
  workspaceId: string,
  ourOffer?: string,
  onProgress?: (current: number, total: number, prospectName: string) => void
): Promise<{
  total: number;
  completed: number;
  failed: number;
  results: AgentResult[];
}> {
  const results: AgentResult[] = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];
    
    if (onProgress) {
      onProgress(i + 1, prospects.length, prospect.name);
    }

    try {
      // Créer le prospect en DB d'abord
      const dbProspect = await prisma.prospect.create({
        data: {
          name: prospect.name,
          company: prospect.company,
          jobTitle: prospect.jobTitle || "",
          linkedInUrl: prospect.linkedInUrl || "",
          notes: prospect.notes,
          status: "NEW",
          workspaceId,
        },
      });

      const result = await runProspectionAgent({
        prospectId: dbProspect.id,
        prospect,
        ourOffer,
      });

      results.push(result);
      
      if (result.success) {
        completed++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      results.push({
        success: false,
        agentName: "Prospection Agent",
        error: String(error),
        steps: [`❌ Erreur pour "${prospect.name}": ${error}`],
        duration: 0,
        iterations: 0,
      });
    }

    // Delay to avoid rate limiting
    if (i < prospects.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  return { total: prospects.length, completed, failed, results };
}
