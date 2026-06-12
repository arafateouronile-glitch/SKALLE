import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CsoAgentQueue } from "@/components/modules/cso/cso-agent-queue";
import { Brain, Mail, Linkedin, MessageCircle, Target, Zap } from "lucide-react";

const CSO_ACTION_TYPES = [
  "CSO_LAUNCH_LINKEDIN",
  "CSO_LAUNCH_EMAIL",
  "CSO_FOLLOWUP",
  "CSO_STALE_REJECT",
];

async function getCsoAgentData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!workspace) return null;

  const decisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId: workspace.id,
      actionType: { in: CSO_ACTION_TYPES },
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const executedCount = decisions.filter((d) => d.status === "EXECUTED").length;

  const prospectsInPipeline = await prisma.prospect.count({
    where: {
      workspaceId: workspace.id,
      status: { in: ["NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED"] },
    },
  });

  return { workspaceId: workspace.id, decisions, executedCount, prospectsInPipeline };
}

const HOW_IT_WORKS = [
  { icon: Target, label: "Détecte", desc: "les prospects high-score non contactés + les stagnants" },
  { icon: Brain, label: "Génère", desc: "des messages personnalisés pour chaque cas (LinkedIn, email, relance)" },
  { icon: Zap, label: "Propose", desc: "une file d'approbation — vous validez ou rejetez chaque action" },
  { icon: Mail, label: "Exécute", desc: "les décisions approuvées : séquences créées, prospects mis à jour" },
];

export default async function CsoAgentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getCsoAgentData(session.user.id);
  if (!data) redirect("/login");

  const { workspaceId, decisions, executedCount, prospectsInPipeline } = data;

  const serializedDecisions = decisions.map((d) => ({
    ...d,
    actionData: d.actionData as Record<string, unknown> | null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    executedAt: d.executedAt?.toISOString() ?? null,
  }));

  const pendingCount = decisions.filter((d) => d.status === "PENDING").length;

  return (
    <div className="space-y-6 pb-8">

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Brain className="h-4 w-4 text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">CSO Agent</h1>
            {pendingCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                {pendingCount} en attente
              </span>
            )}
          </div>
          <p className="text-[13px] text-gray-500">
            Votre pipeline manager autonome — détecte, propose, vous validez
          </p>
        </div>
      </div>

      {/* ── HOW IT WORKS (if empty) ── */}
      {decisions.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-4">Comment ça marche</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="h-5 w-5 rounded-md bg-violet-50 flex items-center justify-center">
                    <step.icon className="h-3 w-3 text-violet-600" />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-800">{step.label}</span>
                </div>
                <p className="text-[11px] text-gray-500 pl-10">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div className="flex items-center gap-2 mb-2">
              <Linkedin className="h-4 w-4 text-blue-600" />
              <Mail className="h-4 w-4 text-violet-600" />
              <MessageCircle className="h-4 w-4 text-amber-600" />
              <span className="text-[12px] font-semibold text-gray-800">Canaux supportés</span>
            </div>
            <p className="text-[12px] text-gray-600">
              LinkedIn (notes de connexion), Email (séquences personnalisées), Relances multi-canal
            </p>
          </div>
        </div>
      )}

      {/* ── QUEUE (avec stats live) ── */}
      <CsoAgentQueue
        workspaceId={workspaceId}
        initialDecisions={serializedDecisions}
        initialExecutedCount={executedCount}
        initialProspectsInPipeline={prospectsInPipeline}
      />
    </div>
  );
}
