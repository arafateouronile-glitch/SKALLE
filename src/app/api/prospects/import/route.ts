/**
 * 📥 API Import prospects (Instagram, etc.)
 *
 * Endpoint appelé par le script IG Extractor ou l'extension Chrome.
 * Authentification : Bearer token (ExtensionToken généré dans le dashboard)
 *
 * Payload : { prospects: [{ name, handle, profileUrl, platform, interaction }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { importInteractions } from "@/lib/services/social/prospector";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ProspectSchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  profileUrl: z.string().url().optional(),
  platform: z.enum(["INSTAGRAM", "FACEBOOK"]).default("INSTAGRAM"),
  interaction: z.string().optional(),
});

const ImportPayloadSchema = z.object({
  prospects: z.array(ProspectSchema).min(1).max(500),
  sourceUrl: z.string().url().optional(), // URL de la page (followers, hashtag)
});

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token manquant. Utilisez Authorization: Bearer <token>" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    const extensionToken = await prisma.extensionToken.findUnique({
      where: { token },
      include: { workspace: { select: { id: true } } },
    });

    if (!extensionToken) {
      return NextResponse.json({ error: "Token invalide ou expiré" }, { status: 401 });
    }

    const workspaceId = extensionToken.workspace.id;
    const body = await req.json();
    const parsed = ImportPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload invalide", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { prospects, sourceUrl } = parsed.data;

    const interactions = prospects.map((p) => {
      const cleanHandle = p.handle.replace(/^@/, "");
      return {
        platform: p.platform,
        type: "FOLLOW" as const,
        sourceUrl: sourceUrl || `https://www.instagram.com/${cleanHandle}/`,
        prospectName: p.name,
        prospectHandle: p.handle.startsWith("@") ? p.handle : `@${cleanHandle}`,
        profileUrl: p.profileUrl || `https://www.instagram.com/${cleanHandle}/`,
        interactionText: p.interaction || "Follower / Hashtag Interest",
      };
    });

    const result = await importInteractions(workspaceId, interactions);

    return NextResponse.json({
      success: true,
      ...result,
      total: prospects.length,
    });
  } catch (error) {
    console.error("[prospects/import]", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
