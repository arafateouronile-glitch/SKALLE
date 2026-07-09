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

  const [prospects, linkedInReplies, emailReplies] = await Promise.all([
    prisma.prospect.findMany({
      where: {
        workspaceId: workspace.id,
        status: {
          in: ["RESPONDED", "REPLIED", "MEETING_BOOKED", "CONTACTED", "NEW", "RESEARCHED"],
        },
        OR: [
          { status: { in: ["RESPONDED", "REPLIED", "MEETING_BOOKED"] } },
          {
            sequences: {
              some: {
                steps: {
                  some: {
                    status: { in: ["OPENED", "REPLIED", "SENT", "DELIVERED"] },
                  },
                },
              },
            },
          },
          { linkedInReplies: { some: {} } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
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
        hubspotContactId: true,
        sequences: {
          where: { isActive: true },
          take: 3,
          select: {
            id: true,
            steps: {
              where: {
                status: { in: ["SENT", "DELIVERED", "OPENED", "REPLIED"] },
              },
              orderBy: { sentAt: "asc" },
              select: {
                id: true,
                channel: true,
                subject: true,
                content: true,
                status: true,
                sentAt: true,
                openedAt: true,
                repliedAt: true,
                metadata: true,
                replies: {
                  orderBy: { receivedAt: "asc" },
                  select: {
                    id: true,
                    fromEmail: true,
                    subject: true,
                    snippet: true,
                    receivedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),

    prisma.linkedInReply.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { receivedAt: "desc" },
      take: 300,
      select: {
        id: true,
        prospectId: true,
        senderName: true,
        messageText: true,
        receivedAt: true,
        isRead: true,
        linkedInUrl: true,
      },
    }),

    // Email replies via ReplyDetection (linked through SequenceStep)
    prisma.replyDetection.findMany({
      where: {
        sequenceStep: {
          sequence: { workspaceId: workspace.id },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 300,
      select: {
        id: true,
        fromEmail: true,
        subject: true,
        snippet: true,
        receivedAt: true,
        messageId: true,
        sequenceStep: {
          select: {
            id: true,
            metadata: true,
            sequence: {
              select: { prospectId: true },
            },
          },
        },
      },
    }),
  ]);

  // Index by prospectId
  const liRepliesByProspect = linkedInReplies.reduce<Record<string, typeof linkedInReplies>>((acc, r) => {
    if (!r.prospectId) return acc;
    (acc[r.prospectId] ??= []).push(r);
    return acc;
  }, {});

  const emailRepliesByProspect = emailReplies.reduce<Record<string, typeof emailReplies>>((acc, r) => {
    const pid = r.sequenceStep?.sequence?.prospectId;
    if (!pid) return acc;
    (acc[pid] ??= []).push(r);
    return acc;
  }, {});

  const unreadLiCount = linkedInReplies.filter((r) => !r.isRead).length;
  // Email replies are always "unread" since ReplyDetection has no isRead field
  const unreadEmailCount = Object.keys(emailRepliesByProspect).length;
  const unreadCount = unreadLiCount + unreadEmailCount;

  const conversations = prospects
    .map((p) => {
      const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
      const li = (ed.linkedIn ?? {}) as Record<string, unknown>;
      const replyPreview = (ed.replyPreview as string) ?? null;
      const liReplies = liRepliesByProspect[p.id] ?? [];
      const emailRepls = emailRepliesByProspect[p.id] ?? [];

      const sentSteps = p.sequences.flatMap((s) => s.steps);

      // Only include prospects with at least some activity
      const hasActivity =
        sentSteps.length > 0 ||
        liReplies.length > 0 ||
        emailRepls.length > 0 ||
        replyPreview != null;

      if (!hasActivity) return null;

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
        hubspotContactId: p.hubspotContactId ?? null,
        sentSteps: sentSteps.map((s) => ({
          id: s.id,
          channel: s.channel as string,
          subject: s.subject ?? null,
          content: s.content,
          status: s.status as string,
          sentAt: s.sentAt?.toISOString() ?? null,
          openedAt: s.openedAt?.toISOString() ?? null,
          repliedAt: s.repliedAt?.toISOString() ?? null,
          isOOO: (s.metadata as { isOOO?: boolean } | null)?.isOOO ?? false,
          emailReplies: s.replies.map((r) => ({
            id: r.id,
            fromEmail: r.fromEmail,
            subject: r.subject,
            snippet: r.snippet,
            receivedAt: r.receivedAt.toISOString(),
          })),
        })),
        linkedInReplies: liReplies.map((r) => ({
          id: r.id,
          senderName: r.senderName,
          messageText: r.messageText,
          receivedAt: r.receivedAt.toISOString(),
          isRead: r.isRead,
          linkedInUrl: r.linkedInUrl,
        })),
        emailReplies: emailRepls.map((r) => ({
          id: r.id,
          fromEmail: r.fromEmail,
          subject: r.subject,
          snippet: r.snippet,
          receivedAt: r.receivedAt.toISOString(),
          isOOO: (r.sequenceStep?.metadata as { isOOO?: boolean } | null)?.isOOO ?? false,
        })),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <CsoInbox
      conversations={conversations}
      calendarLink={workspace.calendarLink ?? null}
      workspaceId={workspace.id}
      unreadCount={unreadCount}
    />
  );
}
