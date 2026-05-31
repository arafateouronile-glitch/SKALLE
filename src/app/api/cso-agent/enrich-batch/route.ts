/**
 * POST /api/cso-agent/enrich-batch
 *
 * Enrichit automatiquement les prospects NEW sans email vérifié via Apollo.
 * Rate-limited : 8 requêtes/s max pour rester dans les limites Apollo.
 *
 * Body: { limit?, onlyNew?, workspaceId? }
 * - limit       : max prospects à traiter (défaut 20, max 50)
 * - onlyNew     : si true, seulement status=NEW (défaut true)
 * - workspaceId : si absent, utilise le workspace de la session
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apolloEnrichPerson, getApolloApiKey } from "@/lib/services/apollo-client";

export const maxDuration = 55;

// ─── Score calculation ────────────────────────────────────────────────────────

interface ScoringInput {
  email: string | null;
  emailVerified: boolean;
  emailStatus: string | null;
  linkedInUrl: string;
  jobTitle: string | null;
  company: string;
  location: string | null;
  personaId: string | null;
}

function computeScore(p: ScoringInput): { score: number; temperature: string } {
  let score = 0;

  // Email quality (0–40 pts) — most important signal
  if (p.email) {
    if (p.emailVerified || p.emailStatus === "verified") score += 40;
    else if (p.emailStatus === "likely to engage") score += 25;
    else score += 10;
  }

  // LinkedIn URL present (0–15 pts)
  if (p.linkedInUrl) score += 15;

  // Job title enriched (0–10 pts)
  if (p.jobTitle) score += 10;

  // Location known (0–5 pts)
  if (p.location) score += 5;

  // Persona linked = ICP match confirmed (0–20 pts)
  if (p.personaId) score += 20;

  // Company always present, but record extra if non-trivial
  if (p.company && p.company.length > 2) score += 5;

  const capped = Math.min(score, 100);
  const temperature =
    capped >= 75 ? "HOT" : capped >= 50 ? "WARM" : "COLD";

  return { score: capped, temperature };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    limit?: number;
    onlyNew?: boolean;
    workspaceId?: string;
  };
  const {
    limit = 20,
    onlyNew = true,
    workspaceId: bodyWorkspaceId,
  } = body;

  const clampedLimit = Math.min(Math.max(1, limit), 50);

  // Resolve workspace
  const workspace = await prisma.workspace.findFirst({
    where: bodyWorkspaceId
      ? { id: bodyWorkspaceId, userId: session.user.id }
      : { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const apiKey = getApolloApiKey(workspace.id);
  if (!apiKey) {
    return NextResponse.json({ error: "Clé Apollo non configurée (APOLLO_API_KEY)" }, { status: 422 });
  }

  // Find prospects to enrich
  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId: workspace.id,
      ...(onlyNew ? { status: "NEW" } : {}),
      emailVerified: false,
      OR: [
        { email: null },
        { emailStatus: { not: "verified" } },
      ],
    },
    select: {
      id: true,
      name: true,
      linkedInUrl: true,
      email: true,
      emailStatus: true,
      emailVerified: true,
      company: true,
      jobTitle: true,
      location: true,
      personaId: true,
    },
    orderBy: { createdAt: "desc" },
    take: clampedLimit,
  });

  if (prospects.length === 0) {
    return NextResponse.json({
      enriched: 0,
      emailsFound: 0,
      hotsDetected: 0,
      skipped: 0,
      message: "Aucun prospect à enrichir dans cette sélection",
    });
  }

  let enriched = 0;
  let emailsFound = 0;
  let hotsDetected = 0;
  let errors = 0;

  // Process with rate limiting — 8 enrichments/s max
  for (const p of prospects) {
    try {
      const [firstName, ...rest] = p.name.trim().split(" ");
      const lastName = rest.join(" ");

      const result = await apolloEnrichPerson(apiKey, {
        linkedInUrl: p.linkedInUrl || null,
        firstName,
        lastName,
        company: p.company,
        email: p.email,
      });

      const newEmail = result?.email ?? p.email;
      const newEmailStatus = result?.emailStatus ?? (p.emailStatus as "verified" | "likely to engage" | "unavailable" | null);
      const newEmailVerified = newEmailStatus === "verified";
      const newJobTitle = result?.title ?? p.jobTitle;
      const newLinkedIn = result?.linkedInUrl ?? p.linkedInUrl;
      const newLocation = result?.city
        ? `${result.city}${result.country ? `, ${result.country}` : ""}`
        : p.location;

      const { score, temperature } = computeScore({
        email: newEmail,
        emailVerified: newEmailVerified,
        emailStatus: newEmailStatus,
        linkedInUrl: newLinkedIn ?? p.linkedInUrl,
        jobTitle: newJobTitle,
        company: p.company,
        location: newLocation,
        personaId: p.personaId,
      });

      await prisma.prospect.update({
        where: { id: p.id },
        data: {
          email: newEmail ?? undefined,
          emailVerified: newEmailVerified,
          emailStatus: newEmailStatus ?? undefined,
          jobTitle: newJobTitle ?? undefined,
          linkedInUrl: newLinkedIn ?? p.linkedInUrl,
          location: newLocation ?? undefined,
          score,
          temperature,
          status: "RESEARCHED",
          lastInteractionAt: new Date(),
          enrichmentData: {
            apollo: {
              apolloId: result?.apolloId,
              emailStatus: newEmailStatus,
              enrichedAt: new Date().toISOString(),
            },
          },
        },
      });

      enriched++;
      if (newEmail && newEmailStatus !== "unavailable") emailsFound++;
      if (temperature === "HOT") hotsDetected++;

      // Rate limit: ~125ms between requests = ~8/s
      await new Promise((r) => setTimeout(r, 130));
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    enriched,
    emailsFound,
    hotsDetected,
    errors,
    total: prospects.length,
    message: `${enriched}/${prospects.length} prospects enrichis — ${emailsFound} emails trouvés — ${hotsDetected} HOT détectés`,
  });
}

// GET — returns enrichment stats for the workspace
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ toEnrich: 0 });

  const toEnrich = await prisma.prospect.count({
    where: {
      workspaceId: workspace.id,
      status: "NEW",
      emailVerified: false,
      OR: [{ email: null }, { emailStatus: { not: "verified" } }],
    },
  });

  return NextResponse.json({ toEnrich });
}
