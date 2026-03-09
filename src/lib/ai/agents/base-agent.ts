/**
 * 🤖 Base Agent Framework - Architecture Agentique Skalle
 * 
 * Ce module définit le framework de base pour tous les agents IA.
 * Les agents peuvent:
 * - Raisonner sur les tâches à accomplir
 * - Utiliser des outils de manière autonome
 * - Planifier et exécuter des actions en séquence
 * - S'adapter en fonction des résultats
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { 
  AIMessage, 
  HumanMessage, 
  SystemMessage,
  BaseMessage 
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { StateGraph, Annotation, END, START } from "@langchain/langgraph";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 AGENT STATE - État partagé entre les étapes de l'agent
// ═══════════════════════════════════════════════════════════════════════════

export const AgentState = Annotation.Root({
  // Messages de la conversation
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // Étape actuelle du workflow
  currentStep: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "start",
  }),
  // Résultats intermédiaires
  intermediateResults: Annotation<Record<string, unknown>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
  // Historique des actions
  actionHistory: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // Erreurs rencontrées
  errors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // Résultat final
  finalResult: Annotation<unknown>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 AGENT CONFIG - Configuration d'un agent
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: DynamicStructuredTool[];
  model?: "gpt-4o" | "gpt-4o-mini" | "claude-3-5-sonnet";
  maxIterations?: number;
  temperature?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏗️ CREATE AGENT - Fabrique d'agents
// ═══════════════════════════════════════════════════════════════════════════

export function createAgent(config: AgentConfig) {
  const {
    name,
    systemPrompt,
    tools,
    model = "gpt-4o-mini",
    maxIterations = 10,
    temperature = 0.7,
  } = config;

  // Sélection du modèle
  const llm = model.startsWith("claude")
    ? new ChatAnthropic({
        model: "claude-sonnet-4-5-20250929",
        temperature,
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    : new ChatOpenAI({
        model,
        temperature,
        apiKey: process.env.OPENAI_API_KEY,
      });

  // Bind tools to the model
  const modelWithTools = llm.bindTools(tools);

  // Create tool node
  const toolNode = new ToolNode(tools);

  // ═══════════════════════════════════════════════════════════════════════════
  // 📍 NODES - Les nœuds du graphe d'agent
  // ═══════════════════════════════════════════════════════════════════════════

  // Node: Agent reasoning
  async function agentNode(state: AgentStateType) {
    const messages = state.messages;
    
    // Add system message if not present
    const hasSystemMessage = messages.some(m => m instanceof SystemMessage);
    const allMessages = hasSystemMessage 
      ? messages 
      : [new SystemMessage(systemPrompt), ...messages];

    const response = await modelWithTools.invoke(allMessages);

    // Log action
    const action = response.tool_calls?.length 
      ? `🔧 Using tools: ${response.tool_calls.map(t => t.name).join(", ")}`
      : `💬 Responding`;

    return {
      messages: [response],
      actionHistory: [action],
      currentStep: "agent",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔀 EDGES - Logique de routing
  // ═══════════════════════════════════════════════════════════════════════════

  function shouldContinue(state: AgentStateType): "tools" | typeof END {
    const lastMessage = state.messages[state.messages.length - 1];
    
    // Check iteration limit
    if (state.actionHistory.length >= maxIterations) {
      return END;
    }

    // If the last message has tool calls, route to tools
    if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
      return "tools";
    }

    // Otherwise, end
    return END;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔄 BUILD GRAPH - Construction du graphe d'agent
  // ═══════════════════════════════════════════════════════════════════════════

  const workflow = new StateGraph(AgentState)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  const graph = workflow.compile();

  // ═══════════════════════════════════════════════════════════════════════════
  // 🚀 RUN AGENT - Exécution de l'agent
  // ═══════════════════════════════════════════════════════════════════════════

  async function run(
    input: string,
    context?: Record<string, unknown>
  ): Promise<AgentResult> {
    const startTime = Date.now();
    
    try {
      // Prepare initial state
      const contextMessage = context 
        ? `\n\nContexte: ${JSON.stringify(context)}`
        : "";
      
      const initialState = {
        messages: [new HumanMessage(input + contextMessage)],
        currentStep: "start",
        intermediateResults: context || {},
        actionHistory: [`🚀 Agent "${name}" démarré`],
        errors: [],
        finalResult: null,
      };

      // Run the graph
      const result = await graph.invoke(initialState);

      // Extract final response
      const lastMessage = result.messages[result.messages.length - 1];
      const finalContent = lastMessage instanceof AIMessage 
        ? lastMessage.content 
        : String(lastMessage.content);

      return {
        success: true,
        agentName: name,
        result: finalContent,
        steps: result.actionHistory,
        intermediateResults: result.intermediateResults,
        duration: Date.now() - startTime,
        iterations: result.actionHistory.length,
      };
    } catch (error) {
      return {
        success: false,
        agentName: name,
        error: String(error),
        steps: [`❌ Erreur: ${error}`],
        duration: Date.now() - startTime,
        iterations: 0,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📤 RETURN AGENT INTERFACE
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    name,
    description: config.description,
    run,
    graph,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentResult {
  success: boolean;
  agentName: string;
  result?: string | unknown;
  error?: string;
  steps: string[];
  intermediateResults?: Record<string, unknown>;
  duration: number;
  iterations: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 AGENT CHAIN - Chaîner plusieurs agents
// ═══════════════════════════════════════════════════════════════════════════

export async function chainAgents(
  agents: ReturnType<typeof createAgent>[],
  initialInput: string,
  context?: Record<string, unknown>
): Promise<AgentResult[]> {
  const results: AgentResult[] = [];
  let currentContext = context || {};
  let currentInput = initialInput;

  for (const agent of agents) {
    const result = await agent.run(currentInput, currentContext);
    results.push(result);

    if (!result.success) {
      break; // Stop chain on error
    }

    // Pass result to next agent
    currentContext = {
      ...currentContext,
      previousAgentResult: result.result,
      previousAgent: agent.name,
    };
    currentInput = `Résultat de l'agent précédent (${agent.name}): ${result.result}\n\nContinue le travail.`;
  }

  return results;
}
