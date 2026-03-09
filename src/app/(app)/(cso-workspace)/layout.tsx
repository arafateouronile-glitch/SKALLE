import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/modules/header";
import { Toaster } from "@/components/ui/sonner";
import prisma from "@/lib/prisma";
import { Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SalesSidebar } from "@/components/modules/sales-sidebar";

// ─── Access Gate ─────────────────────────────────────────────────────────────
async function UpgradeToCso() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-gradient-to-br from-gray-50 via-white to-violet-50/30">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
        <Zap className="h-8 w-8 text-white" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">
        Accès Skalle CSO requis
      </h1>
      <p className="text-gray-500 max-w-md mb-8">
        Votre workspace n&apos;a pas encore accès au Sales OS. Rejoignez la
        waitlist pour être notifié en avant-première dès l&apos;ouverture.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/cso"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg shadow-violet-500/20"
        >
          Rejoindre la waitlist
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/marketing-os"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
        >
          Retour au Marketing OS
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

  let hasCsoAccess = false; // CSO fermé par défaut

  try {
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { hasCsoAccess: true },
    });
    if (workspace !== null) {
      hasCsoAccess = workspace.hasCsoAccess;
    }
  } catch {
    console.warn(
      "[CSO Layout] hasCsoAccess indisponible — lancez `npx prisma db push` puis redémarrez le serveur."
    );
  }

  if (!hasCsoAccess) {
    return <UpgradeToCso />;
  }

  return (
    <div data-theme="cso" className="min-h-screen bg-[linear-gradient(135deg,oklch(0.98_0.01_270)_0%,oklch(0.99_0.005_260)_50%,oklch(0.96_0.02_280)_100%)] text-gray-900">
      <SalesSidebar />
      <div className="lg:pl-[17rem]">
        <Header user={session.user} workspace="cso" />
        <main className="p-6 animate-stagger">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
