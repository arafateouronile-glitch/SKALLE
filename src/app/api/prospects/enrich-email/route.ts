/**
 * POST /api/prospects/enrich-email
 *
 * Cherche l'email d'un prospect via Apollo (LinkedIn URL → name+company fallback).
 * Met à jour le prospect en DB si trouvé.
 *
 * Body: { prospectId }
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apolloEnrichPerson, getApolloApiKey } from "@/lib/services/apollo-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { prospectId } = (await req.json()) as { prospectId: string };
  if (!prospectId) return NextResponse.json({ error: "prospectId requis" }, { status: 400 });

  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId: { in: workspaceIds } },
    select: {
      id: true, name: true, company: true, email: true,
      linkedInUrl: true, enrichmentData: true, workspaceId: true,
    },
  });

  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  // Déjà un email réel
  if (prospect.email && !prospect.email.includes("@discovery.skalle")) {
    return NextResponse.json({ ok: true, email: prospect.email, alreadyHad: true });
  }

  const apiKey = await getApolloApiKey(prospect.workspaceId);
  if (!apiKey) return NextResponse.json({ error: "Clé Apollo non configurée" }, { status: 422 });

  const nameParts = prospect.name.trim().split(/\s+/);
  const enriched = await apolloEnrichPerson(apiKey, {
    linkedInUrl: prospect.linkedInUrl,
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(" "),
    company: prospect.company,
  });

  if (!enriched?.email) {
    return NextResponse.json({ ok: false, found: false });
  }

  const ed = (prospect.enrichmentData ?? {}) as Record<string, unknown>;
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      email: enriched.email,
      emailVerified: enriched.emailStatus === "verified",
      emailStatus: enriched.emailStatus ?? undefined,
      enrichmentData: {
        ...ed,
        apollo: {
          ...(ed.apollo as Record<string, unknown> | undefined ?? {}),
          apolloId: enriched.apolloId,
          email: enriched.email,
          emailStatus: enriched.emailStatus,
          enrichedAt: new Date().toISOString(),
        },
      },
    },
  });

  return NextResponse.json({ ok: true, found: true, email: enriched.email, emailStatus: enriched.emailStatus });
}
