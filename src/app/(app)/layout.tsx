import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveOnboardingStep } from "@/actions/onboarding";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { headers } = await import("next/headers");
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Redirection onboarding : uniquement si on n'est pas déjà sur /onboarding
  const isOnboardingPage = pathname && pathname.startsWith("/onboarding");
  if (pathname && !isOnboardingPage) {
    try {
      const workspace = await prisma.workspace.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
        select: {
          domainUrl: true,
          brandVoice: true,
          _count: { select: { posts: true } },
        },
      });
      if (workspace) {
        const step = await getEffectiveOnboardingStep({
          onboardingStep: 1,
          domainUrl: workspace.domainUrl,
          brandVoice: workspace.brandVoice,
          _count: workspace._count,
        });
        if (step >= 1 && step <= 4) {
          redirect("/onboarding");
        }
      }
    } catch {
      // Ne pas bloquer si la table n'a pas encore onboardingStep (migration en retard)
    }
  }

  return <>{children}</>;
}
