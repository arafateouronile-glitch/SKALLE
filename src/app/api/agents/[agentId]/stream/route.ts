/**
 * POST /api/agents/[agentId]/stream
 *
 * Exécute un agent en mode streaming SSE (Server-Sent Events).
 * Le client reçoit des événements en temps réel :
 *   - data: {"type":"heartbeat"}                              → keep-alive toutes les 15s
 *   - data: {"type":"step","content":"🔧 Outil: web_search"}  → action en cours
 *   - data: {"type":"token","content":"voici"}                → token de texte
 *   - data: {"type":"done","result":{...AgentResult}}         → résultat complet
 *   - data: {"type":"error","error":"..."}                    → erreur fatale
 *
 * Usage côté client (fetch + ReadableStream) :
 *   const res = await fetch('/api/agents/seo/stream', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ input: "Génère un article sur...", context: { workspaceId } })
 *   });
 *   const reader = res.body.getReader();
 *   const decoder = new TextDecoder();
 *   while (true) {
 *     const { done, value } = await reader.read();
 *     if (done) break;
 *     const lines = decoder.decode(value).split('\n\n').filter(Boolean);
 *     for (const line of lines) {
 *       const event = JSON.parse(line.replace('data: ', ''));
 *       if (event.type === 'done') { ... }
 *     }
 *   }
 */

import { auth } from "@/lib/auth";
import { useCredits } from "@/lib/credits";
import { agentRegistry, type AgentType } from "@/lib/ai/agents";

// Timeout maximum pour un agent (60s) — au-delà, on ferme le stream proprement
const AGENT_TIMEOUT_MS = 60_000;
// Intervalle heartbeat pour maintenir la connexion ouverte (Vercel/Nginx coupent à ~25s sans activité)
const HEARTBEAT_INTERVAL_MS = 15_000;

// Map agentId → credit operation
const AGENT_CREDIT_OP: Record<AgentType, "agent_seo" | "agent_discovery" | "agent_social" | "agent_prospection"> = {
  seo: "agent_seo",
  discovery: "agent_discovery",
  social: "agent_social",
  prospection: "agent_prospection",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  // Auth
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Non autorisé", { status: 401 });
  }

  const { agentId } = await params;

  // Validate agent
  const agentInfo = agentRegistry[agentId as AgentType];
  if (!agentInfo) {
    return new Response(`Agent "${agentId}" introuvable`, { status: 404 });
  }

  // Parse body
  let input: string;
  let context: Record<string, unknown> | undefined;
  try {
    const body = await request.json() as { input: string; context?: Record<string, unknown> };
    if (!body.input || typeof body.input !== "string") {
      return new Response("Champ 'input' requis", { status: 400 });
    }
    input = body.input;
    context = body.context;
  } catch {
    return new Response("Body JSON invalide", { status: 400 });
  }

  // Credits
  const creditOp = AGENT_CREDIT_OP[agentId as AgentType];
  try {
    await useCredits(session.user.id, creditOp);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Crédits insuffisants" }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller déjà fermé (client déconnecté) — ignorer silencieusement
        }
      };

      let closed = false;
      const close = () => {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* déjà fermé */ }
        }
      };

      // Heartbeat : envoie un ping toutes les HEARTBEAT_INTERVAL_MS pour éviter le timeout
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        send({ type: "heartbeat" });
      }, HEARTBEAT_INTERVAL_MS);

      // Timeout global : ferme le stream si l'agent prend trop de temps
      const timeout = setTimeout(() => {
        if (!closed) {
          send({ type: "error", error: `Timeout: l'agent n'a pas répondu en ${AGENT_TIMEOUT_MS / 1000}s` });
          clearInterval(heartbeat);
          close();
        }
      }, AGENT_TIMEOUT_MS);

      try {
        for await (const event of agentInfo.agent.stream(input, context)) {
          if (closed) break; // client déconnecté
          send(event as Record<string, unknown>);
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err) {
        send({ type: "error", error: String(err) });
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // désactive le buffering Nginx/Vercel
      Connection: "keep-alive",
    },
  });
}
