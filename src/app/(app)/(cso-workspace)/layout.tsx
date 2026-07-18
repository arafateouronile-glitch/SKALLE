import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppSidebar } from "@/components/modules/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { CsoAccessGate } from "@/components/modules/cso-access-gate";
import prisma from "@/lib/prisma";
import { canAccessCso } from "@/lib/credits";
import { Zap, ArrowRight } from "lucide-react";
import Link from "next/link";

async function UpgradeToCso() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-gradient-to-br from-gray-50 via-white to-violet-50/30">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
        <Zap className="h-8 w-8 text-white" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">
        Accès Skalle CSO requis
      </h1>
      <p className="text-gray-500 max-w-md mb-8">
        Votre workspace n&apos;a pas encore accès au Sales OS. Mettez à niveau
        votre plan pour débloquer la prospection, les séquences et l&apos;agent
        CSO.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg shadow-violet-500/20"
        >
          Voir les offres
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/sales-os/settings"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
        >
          Paramètres du workspace
        </Link>
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default async function CsoWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      credits: true,
      plan: true,
      workspaces: {
        select: {
          id: true,
          brandVoice: true,
          hasCsoAccess: true,
          _count: { select: { personas: true } },
        },
        take: 1,
      },
    },
  });

  const credits = user?.credits ?? 0;
  const plan = user?.plan ?? "FREE";
  const workspace = user?.workspaces?.[0];
  const hasCsoAccess = user ? canAccessCso(user, workspace) : false;

  // Nouvel utilisateur CSO sans persona ni brand voice → onboarding
  if (!pathname.includes("/onboarding")) {
    if (workspace && workspace._count.personas === 0) {
      const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
      if (!bv.websiteUrl) {
        redirect("/sales-os/onboarding");
      }
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <AppSidebar os="cso" user={session.user} credits={credits} plan={plan} />
      <div className="pl-[220px]">
        <main className="p-6 animate-stagger">
          <CsoAccessGate hasCsoAccess={hasCsoAccess} fallback={<UpgradeToCso />}>
            {children}
          </CsoAccessGate>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
