/**
 * HubSpot bidirectional sync logic.
 *
 * Push: SKALLE prospect → HubSpot contact (create/update)
 * Pull: HubSpot contacts modified since last sync → upsert SKALLE prospects
 * Activity: email events → HubSpot email engagements
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { HubSpotClient, HubSpotContact } from "./hubspot-client";

// ─── Token helpers ────────────────────────────────────────────────────────────

export async function getHubSpotClient(workspaceId: string): Promise<HubSpotClient | null> {
  const integration = await prisma.externalIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
  });
  if (!integration) return null;
  const token = decrypt(integration.encryptedApiKey);
  return new HubSpotClient(token);
}

// ─── Prospect → HubSpot contact property mapping ─────────────────────────────

function prospectToHubSpotProps(p: {
  name: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  company: string;
  linkedInUrl: string;
  status: string;
}): Record<string, string> {
  const [firstname, ...rest] = p.name.trim().split(" ");
  const props: Record<string, string> = {
    firstname: firstname ?? p.name,
    lastname: rest.join(" "),
    company: p.company,
    linkedin_bio: p.linkedInUrl,
    hs_lead_status: mapStatusToHubSpot(p.status),
  };
  if (p.email) props.email = p.email;
  if (p.phone) props.phone = p.phone;
  if (p.jobTitle) props.jobtitle = p.jobTitle;
  return props;
}

function mapStatusToHubSpot(status: string): string {
  const map: Record<string, string> = {
    NEW: "NEW",
    RESEARCHED: "OPEN",
    MESSAGES_GENERATED: "OPEN",
    CONTACTED: "IN_PROGRESS",
    RESPONDED: "IN_PROGRESS",
    MEETING_BOOKED: "OPEN_DEAL",
    CONVERTED: "CONNECTED",
    REPLIED: "IN_PROGRESS",
    REJECTED: "UNQUALIFIED",
    UNSUBSCRIBED: "UNQUALIFIED",
  };
  return map[status] ?? "NEW";
}

function hubSpotContactToProspectData(c: HubSpotContact): {
  name: string;
  email: string | undefined;
  phone: string | undefined;
  jobTitle: string | undefined;
  company: string;
  linkedInUrl: string;
} {
  const firstname = c.properties.firstname ?? "";
  const lastname = c.properties.lastname ?? "";
  return {
    name: `${firstname} ${lastname}`.trim() || "HubSpot Contact",
    email: c.properties.email || undefined,
    phone: c.properties.phone || undefined,
    jobTitle: c.properties.jobtitle || undefined,
    company: c.properties.company ?? "Unknown",
    linkedInUrl: c.properties.linkedin_bio ?? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(firstname + " " + lastname)}`,
  };
}

// ─── Push: SKALLE → HubSpot ──────────────────────────────────────────────────

export async function pushProspectToHubSpot(
  prospectId: string,
  workspaceId: string
): Promise<{ hubspotContactId: string; created: boolean }> {
  const client = await getHubSpotClient(workspaceId);
  if (!client) throw new Error("HubSpot non connecté");

  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) throw new Error("Prospect introuvable");

  const props = prospectToHubSpotProps(prospect);
  let hubspotContactId = prospect.hubspotContactId;
  let created = false;

  if (hubspotContactId) {
    await client.updateContact(hubspotContactId, props);
  } else {
    const result = await client.upsertContact(props);
    hubspotContactId = result.contact.id;
    created = result.created;
  }

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { hubspotContactId, hubspotSyncedAt: new Date() },
  });

  return { hubspotContactId, created };
}

// ─── Pull: HubSpot → SKALLE ──────────────────────────────────────────────────

export interface PullResult {
  created: number;
  updated: number;
  skipped: number;
}

export async function pullFromHubSpot(
  workspaceId: string,
  sinceHours = 24
): Promise<PullResult> {
  const client = await getHubSpotClient(workspaceId);
  if (!client) throw new Error("HubSpot non connecté");

  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const result: PullResult = { created: 0, updated: 0, skipped: 0 };

  let after: string | undefined;

  do {
    const page = await client.listRecentlyModifiedContacts(since, after);

    for (const contact of page.results) {
      const data = hubSpotContactToProspectData(contact);

      // Skip contacts without email and without meaningful data
      if (!data.email && data.company === "Unknown") {
        result.skipped++;
        continue;
      }

      // Try to find existing prospect by hubspotContactId or email
      const existing = await prisma.prospect.findFirst({
        where: {
          workspaceId,
          OR: [
            { hubspotContactId: contact.id },
            ...(data.email ? [{ email: data.email, workspaceId }] : []),
          ],
        },
      });

      if (existing) {
        await prisma.prospect.update({
          where: { id: existing.id },
          data: {
            ...data,
            hubspotContactId: contact.id,
            hubspotSyncedAt: new Date(),
          },
        });
        result.updated++;
      } else {
        // Create new prospect from HubSpot
        await prisma.prospect.create({
          data: {
            ...data,
            workspaceId,
            hubspotContactId: contact.id,
            hubspotSyncedAt: new Date(),
          },
        });
        result.created++;
      }
    }

    after = page.paging?.next?.after;
  } while (after);

  return result;
}

// ─── Push all unsynced prospects ─────────────────────────────────────────────

export async function pushAllProspectsToHubSpot(workspaceId: string): Promise<{
  pushed: number;
  errors: number;
}> {
  const client = await getHubSpotClient(workspaceId);
  if (!client) throw new Error("HubSpot non connecté");

  // Prospects without hubspotContactId or not synced in last 24h
  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      OR: [
        { hubspotContactId: null },
        { hubspotSyncedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
    take: 200,
  });

  let pushed = 0;
  let errors = 0;

  for (const p of prospects) {
    try {
      await pushProspectToHubSpot(p.id, workspaceId);
      pushed++;
    } catch {
      errors++;
    }
  }

  return { pushed, errors };
}

// ─── Log email activity to HubSpot ───────────────────────────────────────────

export async function logEmailEventToHubSpot(params: {
  prospectId: string;
  workspaceId: string;
  subject: string;
  body: string;
  eventType: "SENT" | "OPENED" | "REPLIED";
  timestamp: Date;
}): Promise<void> {
  const client = await getHubSpotClient(params.workspaceId);
  if (!client) return; // silently skip if not connected

  const prospect = await prisma.prospect.findUnique({
    where: { id: params.prospectId },
    select: { hubspotContactId: true },
  });

  if (!prospect?.hubspotContactId) return;

  await client.logEmailActivity({
    contactId: prospect.hubspotContactId,
    subject: params.subject,
    body: params.body,
    status: params.eventType,
    timestamp: params.timestamp,
  });
}

// ─── Full bidirectional sync ─────────────────────────────────────────────────

export async function runFullSync(workspaceId: string): Promise<{
  push: { pushed: number; errors: number };
  pull: PullResult;
}> {
  const [push, pull] = await Promise.all([
    pushAllProspectsToHubSpot(workspaceId),
    pullFromHubSpot(workspaceId, 24),
  ]);
  return { push, pull };
}
