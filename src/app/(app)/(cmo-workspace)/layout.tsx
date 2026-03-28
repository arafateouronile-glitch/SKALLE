import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/modules/sidebar";
import { Header } from "@/components/modules/header";
import { Toaster } from "@/components/ui/sonner";
import { CreditsProvider } from "@/components/providers/credits-provider";
import prisma from "@/lib/prisma";
import { Zap, ArrowRight } from "lucide-react";
import Link from "next/link";

async function UpgradeToCmo() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-gradient-to-br from-gray-50 via-white to-emerald-50/30">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
        <Zap className="h-8 w-8 text-white" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">
        Accès Skalle CMO requis
      </h1>
      <p className="text-gray-500 max-w-md mb-8">
        Votre workspace n&apos;a pas encore accès au Marketing OS. Contactez
        votre administrateur ou mettez à niveau votre plan pour débloquer
        toutes les fonctionnalités CMO.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/cmo"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-500/20"
        >
          Voir les offres CMO
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/marketing-os/settings"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
        >
          Paramètres du workspace
        </Link>
      </div>
    </div>
  );
}

export default async function CmoWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Accès par défaut à true pendant la fenêtre de migration (avant npx prisma generate).
  // Dès que la colonne existe en DB et que le client est régénéré, la vraie valeur s'applique.
  let hasCmoAccess = true;

  try {
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { hasCmoAccess: true },
    });
    if (workspace !== null) {
      hasCmoAccess = workspace.hasCmoAccess;
    }
  } catch {
    console.warn(
      "[CMO Layout] hasCmoAccess indisponible — lancez `npx prisma db push` puis redémarrez le serveur."
    );
  }

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? "";
  const isSettingsPage = pathname.includes("/marketing-os/settings");

  if (!hasCmoAccess && !isSettingsPage) {
    return <UpgradeToCmo />;
  }

  // Crédits réels pour le sidebar
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true, plan: true },
  });

  const credits = user?.credits ?? 0;
  const plan = user?.plan ?? "FREE";

  return (
    <CreditsProvider credits={credits} plan={plan}>
      <div data-theme="cmo" className="min-h-screen bg-[linear-gradient(135deg,oklch(0.98_0.005_165)_0%,oklch(0.99_0.002_155)_50%,oklch(0.96_0.02_165)_100%)] text-gray-900">
        <Sidebar credits={credits} plan={plan} />
        <div className="lg:pl-[17rem]">
          <Header user={session.user} workspace="cmo" credits={credits} plan={plan} />
          <main className="p-6 animate-stagger">{children}</main>
        </div>
        <Toaster />
      </div>
    </CreditsProvider>
  );
}
