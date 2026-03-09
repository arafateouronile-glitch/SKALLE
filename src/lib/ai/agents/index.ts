/**
 * 🤖 Skalle AI Agents - Index
 * 
 * Export centralisé de tous les agents IA de Skalle.
 * Chaque agent est autonome et capable de:
 * - Raisonner sur les tâches
 * - Utiliser des outils
 * - S'adapter aux résultats
 */

// Base Agent Framework
export { 
  createAgent, 
  chainAgents,
  AgentState,
  type AgentConfig,
  type AgentResult,
  type AgentStateType,
} from "./base-agent";

// SEO Agent
export { 
  seoAgent, 
  runSEOAgent, 
  runBulkSEOAgent,
  type SEOAgentInput,
  type BulkSEOResult,
} from "./seo-agent";

// Discovery Agent
export { 
  discoveryAgent, 
  runDiscoveryAgent, 
  runMultiCompetitorAnalysis,
  type DiscoveryInput,
} from "./discovery-agent";

// Social Agent
export { 
  socialAgent, 
  runSocialAgent,
  type SocialAgentInput,
} from "./social-agent";

// Prospection Agent
export { 
  prospectionAgent, 
  runProspectionAgent, 
  runBulkProspectionAgent,
  type ProspectionAgentInput,
} from "./prospection-agent";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 AGENT REGISTRY - Registre de tous les agents disponibles
// ═══════════════════════════════════════════════════════════════════════════

import { seoAgent } from "./seo-agent";
import { discoveryAgent } from "./discovery-agent";
import { socialAgent } from "./social-agent";
import { prospectionAgent } from "./prospection-agent";

export const agentRegistry = {
  seo: {
    agent: seoAgent,
    name: "SEO Agent",
    description: "Génère du contenu SEO optimisé de manière autonome",
    icon: "📝",
    capabilities: [
      "Recherche de sources fraîches",
      "Analyse de mots-clés",
      "Rédaction d'articles optimisés",
      "Génération d'images",
      "Optimisation itérative",
    ],
  },
  discovery: {
    agent: discoveryAgent,
    name: "Discovery Agent",
    description: "Analyse la concurrence et identifie les opportunités",
    icon: "🔍",
    capabilities: [
      "Analyse SEO des concurrents",
      "Extraction de stratégie contenu",
      "Identification de gaps",
      "Rapport SWOT automatisé",
      "Recommandations stratégiques",
    ],
  },
  social: {
    agent: socialAgent,
    name: "Social Agent",
    description: "Repurpose le contenu pour les réseaux sociaux",
    icon: "📱",
    capabilities: [
      "Analyse de contenu source",
      "Adaptation multi-plateformes",
      "Génération de threads X",
      "Posts LinkedIn optimisés",
      "Scripts TikTok/Reels",
    ],
  },
  prospection: {
    agent: prospectionAgent,
    name: "Prospection Agent",
    description: "Génère des séquences de prospection LinkedIn personnalisées",
    icon: "🎯",
    capabilities: [
      "Analyse de profil prospect",
      "Recherche entreprise",
      "Messages hyper-personnalisés",
      "Séquence en 3 étapes",
      "Gestion du pipeline",
    ],
  },
};

export type AgentType = keyof typeof agentRegistry;

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Liste tous les agents disponibles
 */
export function listAgents() {
  return Object.entries(agentRegistry).map(([key, value]) => ({
    id: key,
    ...value,
    agent: undefined, // Don't expose the actual agent object
  }));
}

/**
 * Obtient un agent par son ID
 */
export function getAgent(agentId: AgentType) {
  return agentRegistry[agentId];
}

/**
 * Exécute un agent par son ID avec des paramètres génériques
 */
export async function executeAgent(
  agentId: AgentType,
  input: string,
  context?: Record<string, unknown>
) {
  const agentInfo = agentRegistry[agentId];
  if (!agentInfo) {
    throw new Error(`Agent "${agentId}" not found`);
  }
  
  return await agentInfo.agent.run(input, context);
}
