import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppSidebar } from "@/components/modules/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import prisma from "@/lib/prisma";

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

  // Accès ouvert — retirer cette gate si tu veux la réactiver
  // if (!hasCsoAccess) return <UpgradeToCso />;

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
          _count: { select: { personas: true } },
        },
        take: 1,
      },
    },
  });

  const credits = user?.credits ?? 0;
  const plan = user?.plan ?? "FREE";

  // Nouvel utilisateur CSO sans persona ni brand voice → onboarding
  if (!pathname.includes("/onboarding")) {
    const workspace = user?.workspaces?.[0];
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
        <main className="p-6 animate-stagger">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
