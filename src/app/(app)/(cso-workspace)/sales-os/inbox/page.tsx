import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CsoInbox } from "@/components/modules/cso/cso-inbox";

export default async function InboxPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, calendarLink: true },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) redirect("/login");

  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId: workspace.id,
      status: { in: ["RESPONDED", "REPLIED", "MEETING_BOOKED", "CONTACTED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      jobTitle: true,
      company: true,
      linkedInUrl: true,
      email: true,
      status: true,
      score: true,
      updatedAt: true,
      enrichmentData: true,
      sequences: {
        where: { isActive: true },
        take: 1,
        select: {
          steps: {
            where: { status: { in: ["SENT", "DELIVERED", "OPENED", "REPLIED"] } },
            orderBy: { sentAt: "asc" },
            select: {
              id: true, channel: true, subject: true, content: true,
              status: true, sentAt: true, openedAt: true,
            },
          },
        },
      },
    },
  });

  const conversations = prospects
    .map((p) => {
      const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
      const li = (ed.linkedIn ?? {}) as Record<string, unknown>;
      const replyPreview = (ed.replyPreview as string) ?? null;
      const sentSteps = p.sequences[0]?.steps ?? [];
      if (!replyPreview && sentSteps.length === 0) return null;
      return {
        id: p.id,
        name: p.name,
        jobTitle: p.jobTitle ?? null,
        company: p.company,
        linkedInUrl: p.linkedInUrl ?? null,
        email: p.email ?? null,
        status: p.status as string,
        score: p.score,
        updatedAt: p.updatedAt.toISOString(),
        headline: (li.headline as string) ?? null,
        about: (li.about as string) ?? null,
        replyPreview,
        respondedAt: (ed.respondedAt as string) ?? null,
        pendingMessage: (ed.pendingMessage as string) ?? null,
        sentSteps: sentSteps.map((s) => ({
          id: s.id,
          channel: s.channel as string,
          subject: s.subject ?? null,
          content: s.content,
          status: s.status as string,
          sentAt: s.sentAt?.toISOString() ?? null,
          openedAt: s.openedAt?.toISOString() ?? null,
        })),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return <CsoInbox conversations={conversations} calendarLink={workspace.calendarLink ?? null} />;
}
