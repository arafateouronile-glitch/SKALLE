/**
 * LinkedIn Warm Lead Scraper — server-side (sans extension Chrome)
 *
 * Utilise li_at + JSESSIONID stockés dans LinkedInAutomationConfig pour
 * interroger l'API Voyager directement depuis le serveur.
 *
 * Sources :
 *   - Profile viewers  : GET /voyager/api/wvmpProfile/views?q=viewedBy
 *   - Followers        : GET /voyager/api/relationships/followers?q=followersOf
 *
 * Appelé par le cron Inngest serverSideWarmLeadsCron (toutes les 6h).
 * Élimine la dépendance à l'extension Chrome ouverte — parité avec Valley.
 */

import { prisma } from "@/lib/prisma";
import { createVoyagerSession } from "@/lib/services/prospects/linkedin-sender";
import { getExternalIntegrationKey } from "@/lib/services/integrations/external";
import { importInteractions, generatePersonalizedDM, enrollInteractionInSequence } from "./prospector";
import type { RawInteraction } from "./prospector";

const LI_API_V2 = "https://api.linkedin.com/v2";

const LI_VOYAGER = "https://www.linkedin.com/voyager/api";

interface ScrapedProfile {
  name: string;
  handle: string;
  profileUrl: string;
  headline: string;
}

// ─── Helpers Voyager ──────────────────────────────────────────────────────────

function voyagerHeaders(session: { cookie: string; csrfToken: string; userAgent: string }) {
  return {
    Cookie: session.cookie,
    "Csrf-Token": session.csrfToken,
    "User-Agent": session.userAgent,
    "X-Restli-Protocol-Version": "2.0.0",
    "X-Li-Lang": "fr_FR",
    Accept: "application/vnd.linkedin.normalized+json+2.1",
  };
}

function parseMiniProfile(mp: Record<string, unknown> | null | undefined): ScrapedProfile | null {
  if (!mp?.publicIdentifier) return null;
  const firstName = String(mp.firstName ?? "");
  const lastName  = String(mp.lastName ?? "");
  const handle    = String(mp.publicIdentifier);
  return {
    name:       [firstName, lastName].filter(Boolean).join(" ") || "LinkedIn Member",
    handle,
    profileUrl: `https://www.linkedin.com/in/${handle}`,
    headline:   String(mp.occupation ?? mp.headline ?? ""),
  };
}

// ─── OAuth token helper ───────────────────────────────────────────────────────

interface OAuthToken { accessToken: string; personUrn: string }

async function getOAuthToken(workspaceId: string): Promise<OAuthToken | null> {
  const raw = await getExternalIntegrationKey(workspaceId, "LINKEDIN_OAUTH");
  if (!raw) return null;
  try { return JSON.parse(raw) as OAuthToken; } catch { return null; }
}

// ─── Profile Viewers ──────────────────────────────────────────────────────────

async function scrapeViewers(
  session: { cookie: string; csrfToken: string; userAgent: string },
  maxCount = 20
): Promise<ScrapedProfile[]> {
  const profiles: ScrapedProfile[] = [];
  let start = 0;
  const count = Math.min(maxCount, 20);

  while (profiles.length < maxCount) {
    try {
      const res = await fetch(
        `${LI_VOYAGER}/wvmpProfile/views?q=viewedBy&count=${count}&start=${start}`,
        { headers: voyagerHeaders(session), signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) break;

      const data = await res.json() as { elements?: unknown[]; paging?: { total: number } };
      const elements = (data.elements ?? []) as Array<Record<string, unknown>>;
      if (!elements.length) break;

      for (const el of elements) {
        const mp =
          (el.actor as Record<string, unknown>)?.miniProfile as Record<string, unknown> ??
          (el.navigationContext as Record<string, unknown>)?.navigationDetails as Record<string, unknown> ??
          null;
        const profile = parseMiniProfile(mp as Record<string, unknown> | null);
        if (profile) profiles.push(profile);
      }

      const total = data.paging?.total ?? 0;
      start += elements.length;
      if (start >= total || start >= maxCount) break;

      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    } catch {
      break;
    }
  }

  return profiles;
}

// ─── Followers ────────────────────────────────────────────────────────────────

async function getMyPersonUrn(
  session: { cookie: string; csrfToken: string; userAgent: string }
): Promise<string | null> {
  try {
    const res = await fetch(`${LI_VOYAGER}/me`, {
      headers: voyagerHeaders(session),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { miniProfile?: { entityUrn?: string } };
    const miniUrn = data.miniProfile?.entityUrn ?? "";
    const id = miniUrn.replace("urn:li:fs_miniProfile:", "");
    return id ? `urn:li:fsd_profile:${id}` : null;
  } catch {
    return null;
  }
}

async function scrapeFollowers(
  session: { cookie: string; csrfToken: string; userAgent: string },
  maxCount = 50
): Promise<ScrapedProfile[]> {
  const personUrn = await getMyPersonUrn(session);
  if (!personUrn) return [];

  const profiles: ScrapedProfile[] = [];
  let start = 0;
  const count = Math.min(maxCount, 50);
  const encodedUrn = encodeURIComponent(personUrn);

  while (profiles.length < maxCount) {
    try {
      const res = await fetch(
        `${LI_VOYAGER}/relationships/followers?q=followersOf&entityUrn=${encodedUrn}&count=${count}&start=${start}`,
        { headers: voyagerHeaders(session), signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) break;

      const data = await res.json() as { elements?: unknown[]; paging?: { total: number } };
      const elements = (data.elements ?? []) as Array<Record<string, unknown>>;
      if (!elements.length) break;

      for (const el of elements) {
        const mp = el.miniProfile as Record<string, unknown> | null;
        const profile = parseMiniProfile(mp);
        if (profile) profiles.push(profile);
      }

      const total = data.paging?.total ?? 0;
      start += elements.length;
      if (start >= total || start >= maxCount) break;

      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    } catch {
      break;
    }
  }

  return profiles;
}

// ─── Import pipeline ──────────────────────────────────────────────────────────

async function importAndEnroll(
  workspaceId: string,
  profiles: ScrapedProfile[],
  type: "PROFILE_VIEW" | "FOLLOW",
  sourceUrl: string
): Promise<{ imported: number; enrolled: number }> {
  if (!profiles.length) return { imported: 0, enrolled: 0 };

  const interactions: RawInteraction[] = profiles.map((p) => ({
    platform: "LINKEDIN" as const,
    type,
    sourceUrl,
    prospectName: p.name,
    prospectHandle: p.handle,
    profileUrl: p.profileUrl,
    interactionText: p.headline || undefined,
  }));

  const { imported } = await importInteractions(workspaceId, interactions);
  if (imported === 0) return { imported: 0, enrolled: 0 };

  // Générer DM + enrôler en séquence pour les nouvelles interactions
  const { Prisma } = await import("@prisma/client");
  const fresh = await prisma.socialInteraction.findMany({
    where: {
      workspaceId,
      platform: "LINKEDIN",
      type,
      sourceUrl,
      suggestedDMs: { equals: Prisma.DbNull },
      status: "PENDING",
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: imported,
  });

  let enrolled = 0;
  for (const interaction of fresh) {
    try {
      await generatePersonalizedDM(interaction.id);
      const result = await enrollInteractionInSequence(interaction.id);
      if (result && !result.skipped) enrolled++;
    } catch { /* non bloquant */ }
  }

  return { imported, enrolled };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 ENTRY POINT — appelé par l'Inngest cron
// ═══════════════════════════════════════════════════════════════════════════

// ─── Followers via API officielle (si disponible) ────────────────────────────
// L'API officielle LinkedIn v2 donne le count via networkSizes.
// La LISTE des followers n'est pas exposée via OAuth standard —
// on tente, et on tombe en Voyager si 403/404.

async function scrapeFollowersOfficialAPI(
  accessToken: string,
  personUrn: string,
  maxCount: number
): Promise<ScrapedProfile[] | null> {
  try {
    // Tenter l'endpoint followers (disponible avec LinkedIn Partner Program ou certains plans)
    const encoded = encodeURIComponent(personUrn);
    const res = await fetch(
      `${LI_API_V2}/relationships/followers?q=followersOf&entityUrn=${encoded}&count=${Math.min(maxCount, 50)}&start=0`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": "202304",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null; // Pas de permission → fallback Voyager

    const data = await res.json() as { elements?: unknown[] };
    const elements = (data.elements ?? []) as Array<Record<string, unknown>>;
    const profiles: ScrapedProfile[] = [];
    for (const el of elements) {
      const mp = el.miniProfile as Record<string, unknown> | null;
      const profile = parseMiniProfile(mp);
      if (profile) profiles.push(profile);
    }
    return profiles;
  } catch {
    return null;
  }
}

export interface WarmScrapeResult {
  workspaceId: string;
  viewers: { imported: number; enrolled: number };
  followers: { imported: number; enrolled: number };
  error?: string;
}

/**
 * Scrape viewers + followers depuis le serveur pour un workspace donné.
 * Utilise li_at + jsessionId de LinkedInAutomationConfig.
 */
export async function scrapeWarmLeadsServerSide(
  workspaceId: string
): Promise<WarmScrapeResult> {
  const empty = { workspaceId, viewers: { imported: 0, enrolled: 0 }, followers: { imported: 0, enrolled: 0 } };

  const config = await prisma.linkedInAutomationConfig.findUnique({
    where: { workspaceId },
    select: { liAt: true, jsessionId: true, isActive: true },
  });

  if (!config?.liAt) return { ...empty, error: "LinkedInAutomationConfig manquant" };

  let session: { cookie: string; csrfToken: string; userAgent: string };
  try {
    session = await createVoyagerSession(config.liAt, config.jsessionId);
  } catch {
    return { ...empty, error: "Session Voyager invalide — cookie expiré ?" };
  }

  // OAuth token (API officielle LinkedIn)
  const oauthToken = await getOAuthToken(workspaceId);

  // Scrape viewers (Voyager uniquement — pas d'endpoint officiel)
  const viewerProfiles = await scrapeViewers(session, 20);
  const viewers = await importAndEnroll(
    workspaceId, viewerProfiles, "PROFILE_VIEW",
    "https://www.linkedin.com/mynetwork/wvmp/"
  );

  // Pause humaine entre les deux scrapes
  await new Promise((r) => setTimeout(r, 2_000 + Math.random() * 2_000));

  // Scrape followers — essai API officielle, fallback Voyager
  let followerProfiles: ScrapedProfile[];
  if (oauthToken) {
    const official = await scrapeFollowersOfficialAPI(oauthToken.accessToken, oauthToken.personUrn, 50);
    followerProfiles = official ?? await scrapeFollowers(session, 50);
  } else {
    followerProfiles = await scrapeFollowers(session, 50);
  }
  const followers = await importAndEnroll(
    workspaceId, followerProfiles, "FOLLOW",
    "https://www.linkedin.com/mynetwork/followers/"
  );

  return { workspaceId, viewers, followers };
}
