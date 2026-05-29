import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true, plan: true },
  });

  const credits = user?.credits ?? 0;
  const plan = user?.plan ?? "FREE";

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
