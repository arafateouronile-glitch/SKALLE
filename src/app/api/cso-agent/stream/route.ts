import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  observePipeline,
  generateCsoDecisions,
  storeCsoDecisions,
  type CsoProgressEvent,
} from "@/lib/services/sales/cso-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type StepId = "observe" | "research" | "generate" | "personalize" | "store";
type StreamEvent =
  | { type: "step"; id: StepId; status: "running" | "done" | "error"; label: string }
  | { type: "done"; newCount: number; totalGenerated: number }
  | { type: "error"; message: string };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as { workspaceId?: string };
  const { workspaceId } = body;
  if (!workspaceId)
    return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws)
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (evt: StreamEvent) => {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      };

      try {
        // ── 1. Observe ─────────────────────────────────────────────────────────
        send({ type: "step", id: "observe", status: "running", label: "Observation du pipeline…" });
        const obs = await observePipeline(workspaceId);
        const totalProspects = obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;
        send({
          type: "step", id: "observe", status: "done",
          label: `${obs.highScoreNew.length} prospects high-score · ${obs.stagnantContacted.length} relances · ${obs.staleProspects.length} stagnants`,
        });

        if (totalProspects === 0) {
          send({ type: "done", newCount: 0, totalGenerated: 0 });
          return;
        }

        // ── 2-4. Generate (includes research + Claude + personalization) ────────
        const decisions = await generateCsoDecisions(
          obs,
          workspaceId,
          (evt: CsoProgressEvent) => {
            if (evt.step === "research_start") {
              send({
                type: "step", id: "research", status: "running",
                label: `Analyse de ${evt.meta.count} profil${evt.meta.count !== 1 ? "s" : ""}…`,
              });
            } else if (evt.step === "research_done") {
              send({
                type: "step", id: "research", status: "done",
                label: evt.meta.count > 0
                  ? `${evt.meta.count} signal${evt.meta.count !== 1 ? "s" : ""} récupéré${evt.meta.count !== 1 ? "s" : ""}`
                  : "Aucun signal externe disponible",
              });
            } else if (evt.step === "generate_start") {
              send({ type: "step", id: "generate", status: "running", label: "Claude analyse le pipeline…" });
            } else if (evt.step === "generate_done") {
              send({
                type: "step", id: "generate", status: "done",
                label: `${evt.meta.count} décision${evt.meta.count !== 1 ? "s" : ""} planifiée${evt.meta.count !== 1 ? "s" : ""}`,
              });
            } else if (evt.step === "personalize_start") {
              send({
                type: "step", id: "personalize", status: "running",
                label: evt.meta.count > 0
                  ? `Personnalisation de ${evt.meta.count} message${evt.meta.count !== 1 ? "s" : ""}…`
                  : "Personnalisation des messages…",
              });
            } else if (evt.step === "personalize_done") {
              send({ type: "step", id: "personalize", status: "done", label: "Messages personnalisés" });
            }
          }
        );

        // ── 5. Store ────────────────────────────────────────────────────────────
        send({ type: "step", id: "store", status: "running", label: "Sauvegarde des décisions…" });
        const stored = await storeCsoDecisions(workspaceId, decisions);
        send({
          type: "step", id: "store", status: "done",
          label: stored > 0
            ? `${stored} nouvelle${stored !== 1 ? "s" : ""} décision${stored !== 1 ? "s" : ""} ajoutée${stored !== 1 ? "s" : ""}`
            : "Aucune nouvelle décision (déjà en file ou rejetées récemment)",
        });

        send({ type: "done", newCount: stored, totalGenerated: decisions.length });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        try { ctrl.close(); } catch { /* déjà fermé */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
