import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/modules/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { GoskalleAccessGate } from "@/components/modules/goskalle-access-gate";
import { GoskalleCommandPalette } from "@/components/modules/goskalle/goskalle-command-palette";
import prisma from "@/lib/prisma";
import { canAccessGoskalle } from "@/lib/credits";
import { Radar, ArrowRight } from "lucide-react";
import Link from "next/link";

function UpgradeToGoskalle() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-gradient-to-br from-gray-50 via-white to-amber-50/30">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
        <Radar className="h-8 w-8 text-white" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">Goskalle — accès restreint</h1>
      <p className="text-gray-500 max-w-md mb-8">
        Ce workspace n&apos;a pas encore accès à Goskalle. C&apos;est un produit en
        incubation, pas encore ouvert au public.
      </p>

      <Link
        href="/sales-os"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/20"
      >
        Retour au Sales OS
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default async function GoskalleWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      credits: true,
      plan: true,
      workspaces: {
        select: { id: true, hasGoskalleAccess: true },
        take: 1,
      },
    },
  });

  const credits = user?.credits ?? 0;
  const plan = user?.plan ?? "FREE";
  const workspace = user?.workspaces?.[0];
  const hasGoskalleAccess = canAccessGoskalle(workspace);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <AppSidebar os="goskalle" user={session.user} credits={credits} plan={plan} />
      <div className="pl-[220px]">
        <main className="p-6 animate-stagger">
          <GoskalleAccessGate hasGoskalleAccess={hasGoskalleAccess} fallback={<UpgradeToGoskalle />}>
            {children}
          </GoskalleAccessGate>
        </main>
      </div>
      {hasGoskalleAccess && <GoskalleCommandPalette />}
      <Toaster />
    </div>
  );
}
