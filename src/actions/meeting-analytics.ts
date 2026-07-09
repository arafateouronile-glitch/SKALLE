"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MeetingAnalyticsResult {
  // KPIs
  totalMeetings: number;
  convertedFromMeeting: number;
  conversionRate: number | null;
  avgDaysToMeeting: number | null;
  avgDaysToClose: number | null;
  totalRevenueClosed: number;

  // Trend: meetings booked per week (last 12 weeks)
  weeklyTrend: { week: string; meetings: number; converted: number }[];

  // Source breakdown
  bySource: { source: string; label: string; meetings: number; conversions: number }[];

  // Channel breakdown (first sequence channel leading to meeting)
  byChannel: { channel: string; meetings: number }[];

  // Top performing prospects that converted
  recentMeetings: {
    id: string;
    name: string;
    company: string;
    jobTitle: string | null;
    status: string;
    meetingBookedAt: string | null;
    value: number | null;
    source: string | null;
  }[];

  // Funnel: contacted → responded → meeting → converted
  funnel: { stage: string; label: string; count: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  FACEBOOK_GROUP: "Facebook",
  INSTAGRAM_HASHTAG: "Instagram",
  SEO_INBOUND: "SEO Inbound",
  MANUAL: "Manuel",
  IMPORT: "Import",
};

function weekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return d.toISOString().slice(0, 10);
}

// ─── Main action ───────────────────────────────────────────────────────────────

export async function getMeetingAnalytics(
  workspaceId: string
): Promise<MeetingAnalyticsResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!ws) throw new Error("Workspace non trouvé");

  // All prospects with MEETING_BOOKED or CONVERTED
  const meetingProspects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      status: { in: ["MEETING_BOOKED", "CONVERTED"] },
    },
    select: {
      id: true,
      name: true,
      company: true,
      jobTitle: true,
      status: true,
      source: true,
      platform: true,
      value: true,
      meetingBookedAt: true,
      createdAt: true,
      lastInteractionAt: true,
      sequences: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          steps: {
            take: 1,
            where: { status: { not: "PENDING" } },
            orderBy: { stepNumber: "asc" },
            select: { channel: true, sentAt: true },
          },
        },
      },
    },
    orderBy: { meetingBookedAt: "desc" },
  });

  // All CONTACTED+ for funnel
  const funnelCounts = await prisma.prospect.groupBy({
    by: ["status"],
    where: {
      workspaceId,
      status: { in: ["CONTACTED", "RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"] },
    },
    _count: { id: true },
  });
  const countByStatus = Object.fromEntries(
    funnelCounts.map((r) => [r.status, r._count.id])
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────────

  const totalMeetings = meetingProspects.length;
  const converted = meetingProspects.filter((p) => p.status === "CONVERTED");
  const convertedFromMeeting = converted.length;
  const conversionRate =
    totalMeetings > 0
      ? Math.round((convertedFromMeeting / totalMeetings) * 100)
      : null;

  // Avg days from createdAt to meetingBookedAt (for those who have both)
  const withMeetingDate = meetingProspects.filter((p) => p.meetingBookedAt);
  const avgDaysToMeeting =
    withMeetingDate.length > 0
      ? Math.round(
          withMeetingDate.reduce((sum, p) => {
            const diff =
              (p.meetingBookedAt!.getTime() - p.createdAt.getTime()) /
              (1000 * 60 * 60 * 24);
            return sum + diff;
          }, 0) / withMeetingDate.length
        )
      : null;

  // Avg days to close (converted only)
  const withClose = converted.filter((p) => p.meetingBookedAt);
  const avgDaysToClose =
    withClose.length > 0
      ? Math.round(
          withClose.reduce((sum, p) => {
            const diff =
              ((p.lastInteractionAt ?? new Date()).getTime() -
                p.createdAt.getTime()) /
              (1000 * 60 * 60 * 24);
            return sum + diff;
          }, 0) / withClose.length
        )
      : null;

  const totalRevenueClosed = converted.reduce(
    (sum, p) => sum + (p.value ?? 0),
    0
  );

  // ── Weekly trend (last 12 weeks) ──────────────────────────────────────────────

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const weekMap = new Map<string, { meetings: number; converted: number }>();
  // Pre-fill 12 weeks
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    weekMap.set(weekLabel(d), { meetings: 0, converted: 0 });
  }

  for (const p of meetingProspects) {
    const date = p.meetingBookedAt ?? p.lastInteractionAt ?? p.createdAt;
    if (date < twelveWeeksAgo) continue;
    const wk = weekLabel(date);
    if (!weekMap.has(wk)) continue;
    const entry = weekMap.get(wk)!;
    entry.meetings += 1;
    if (p.status === "CONVERTED") entry.converted += 1;
  }

  const weeklyTrend = Array.from(weekMap.entries()).map(([week, data]) => ({
    week,
    ...data,
  }));

  // ── Source breakdown ──────────────────────────────────────────────────────────

  const sourceMap = new Map<
    string,
    { meetings: number; conversions: number }
  >();
  for (const p of meetingProspects) {
    const raw = p.source ?? p.platform ?? "LINKEDIN";
    const key =
      raw.toUpperCase().includes("INSTAGRAM")
        ? "INSTAGRAM_HASHTAG"
        : raw.toUpperCase().includes("FACEBOOK")
        ? "FACEBOOK_GROUP"
        : raw.toUpperCase() === "SEO_INBOUND"
        ? "SEO_INBOUND"
        : "LINKEDIN";
    const entry = sourceMap.get(key) ?? { meetings: 0, conversions: 0 };
    entry.meetings += 1;
    if (p.status === "CONVERTED") entry.conversions += 1;
    sourceMap.set(key, entry);
  }
  const bySource = Array.from(sourceMap.entries()).map(([source, data]) => ({
    source,
    label: SOURCE_LABELS[source] ?? source,
    ...data,
  }));

  // ── Channel breakdown (first step channel leading to meeting) ─────────────────

  const channelMap = new Map<string, number>();
  for (const p of meetingProspects) {
    const firstStep = p.sequences[0]?.steps[0];
    const ch = firstStep?.channel ?? "EMAIL";
    channelMap.set(ch, (channelMap.get(ch) ?? 0) + 1);
  }
  const byChannel = Array.from(channelMap.entries()).map(([channel, meetings]) => ({
    channel,
    meetings,
  }));

  // ── Recent meetings ───────────────────────────────────────────────────────────

  const recentMeetings = meetingProspects.slice(0, 15).map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    jobTitle: p.jobTitle,
    status: p.status,
    meetingBookedAt: p.meetingBookedAt?.toISOString() ?? null,
    value: p.value,
    source: p.source ?? p.platform,
  }));

  // ── Funnel ────────────────────────────────────────────────────────────────────

  const funnel = [
    {
      stage: "CONTACTED",
      label: "Contactés",
      count:
        (countByStatus["CONTACTED"] ?? 0) +
        (countByStatus["RESPONDED"] ?? 0) +
        (countByStatus["REPLIED"] ?? 0) +
        (countByStatus["MEETING_BOOKED"] ?? 0) +
        (countByStatus["CONVERTED"] ?? 0),
    },
    {
      stage: "RESPONDED",
      label: "Ont répondu",
      count:
        (countByStatus["RESPONDED"] ?? 0) +
        (countByStatus["REPLIED"] ?? 0) +
        (countByStatus["MEETING_BOOKED"] ?? 0) +
        (countByStatus["CONVERTED"] ?? 0),
    },
    {
      stage: "MEETING_BOOKED",
      label: "Meeting booké",
      count:
        (countByStatus["MEETING_BOOKED"] ?? 0) +
        (countByStatus["CONVERTED"] ?? 0),
    },
    {
      stage: "CONVERTED",
      label: "Convertis",
      count: countByStatus["CONVERTED"] ?? 0,
    },
  ];

  return {
    totalMeetings,
    convertedFromMeeting,
    conversionRate,
    avgDaysToMeeting,
    avgDaysToClose,
    totalRevenueClosed,
    weeklyTrend,
    bySource,
    byChannel,
    recentMeetings,
    funnel,
  };
}
