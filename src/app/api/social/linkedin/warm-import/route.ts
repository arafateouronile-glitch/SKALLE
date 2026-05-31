/**
 * POST /api/social/linkedin/warm-import
 *
 * Reçoit les profile viewers et followers scrapés par l'extension Chrome.
 * Authentification : Bearer token (ExtensionToken table).
 * Crée des SocialInteraction (platform: LINKEDIN, type: PROFILE_VIEW | FOLLOW)
 * et déclenche la génération de DM IA + enrôlement séquence warm lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  importInteractions,
  generatePersonalizedDM,
  enrollInteractionInSequence,
  type RawInteraction,
} from "@/lib/services/social/prospector";

interface WarmLead {
  name: string;
  handle: string;
  profileUrl: string;
  headline?: string;
}

interface ImportBody {
  type: "PROFILE_VIEW" | "FOLLOW";
  leads: WarmLead[];
}

async function resolveWorkspaceFromToken(
  token: string
): Promise<string | null> {
  const record = await prisma.extensionToken.findUnique({
    where: { token },
    select: { workspaceId: true },
  });
  return record?.workspaceId ?? null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 });
  }

  const workspaceId = await resolveWorkspaceFromToken(token);
  if (!workspaceId) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }

  let body: ImportBody;
  try {
    body = await req.json() as ImportBody;
  } catch {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 });
  }

  const { type, leads } = body;
  if (!["PROFILE_VIEW", "FOLLOW"].includes(type) || !Array.isArray(leads)) {
    return NextResponse.json({ error: "type ou leads invalide" }, { status: 400 });
  }

  // Construire les RawInteractions — sourceUrl = profil de l'utilisateur SKALLE
  // (conventionnellement l'URL "about:viewer" pour les viewers, page profil pour followers)
  const sourceUrl =
    type === "PROFILE_VIEW"
      ? "https://www.linkedin.com/mynetwork/wvmp/"
      : "https://www.linkedin.com/mynetwork/followers/";

  const interactions: RawInteraction[] = leads
    .filter((l) => l.handle && l.name)
    .map((l) => ({
      platform: "LINKEDIN" as const,
      type: type as "PROFILE_VIEW" | "FOLLOW",
      sourceUrl,
      prospectName: l.name,
      prospectHandle: l.handle,
      profileUrl: l.profileUrl,
      interactionText: l.headline ?? undefined,
    }));

  if (!interactions.length) {
    return NextResponse.json({ imported: 0, duplicates: 0, enrolled: 0 });
  }

  const { imported, duplicates } = await importInteractions(workspaceId, interactions);

  // Génération DM + enrôlement séquence en arrière-plan (fire & forget)
  if (imported > 0) {
    void (async () => {
      try {
        const freshInteractions = await prisma.socialInteraction.findMany({
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

        for (const interaction of freshInteractions) {
          try {
            await generatePersonalizedDM(interaction.id);
            await enrollInteractionInSequence(interaction.id);
          } catch { /* non bloquant */ }
        }
      } catch { /* non bloquant */ }
    })();
  }

  return NextResponse.json({ imported, duplicates, enrolled: imported });
}
