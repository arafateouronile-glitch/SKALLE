/**
 * 📥 API Import membres groupe Facebook
 *
 * Endpoint appelé par l'extension Chrome pour importer les membres scrapés.
 * Authentification : Bearer token (ExtensionToken généré dans le dashboard)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const MemberSchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1), // ID ou username Facebook
  profileUrl: z.string().url().optional(),
  metaUserId: z.string().optional(),
});

const ImportPayloadSchema = z.object({
  groupId: z.string().min(1), // ID Facebook du groupe
  groupName: z.string().min(1),
  groupUrl: z.string().url(),
  members: z.array(MemberSchema).min(1).max(500), // Batch max 500
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

    // Valider le token d'extension
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

    const { groupId, groupName, groupUrl, members } = parsed.data;

    // Créer ou mettre à jour le groupe
    const group = await prisma.facebookGroup.upsert({
      where: {
        workspaceId_facebookId: { workspaceId, facebookId: groupId },
      },
      create: {
        workspaceId,
        facebookId: groupId,
        name: groupName,
        url: groupUrl,
        memberCount: members.length,
        lastSyncedAt: new Date(),
      },
      update: {
        name: groupName,
        url: groupUrl,
        lastSyncedAt: new Date(),
      },
    });

    let imported = 0;
    let duplicates = 0;

    for (const m of members) {
      const existing = await prisma.socialInteraction.findFirst({
        where: {
          workspaceId,
          facebookGroupId: group.id,
          prospectHandle: m.handle,
        },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      await prisma.socialInteraction.create({
        data: {
          platform: "FACEBOOK",
          type: "GROUP_MEMBER",
          sourceUrl: groupUrl,
          prospectName: m.name,
          prospectHandle: m.handle,
          profileUrl: m.profileUrl,
          metaUserId: m.metaUserId,
          facebookGroupId: group.id,
          workspaceId,
        },
      });
      imported++;
    }

    return NextResponse.json({
      success: true,
      groupId: group.id,
      imported,
      duplicates,
      total: members.length,
    });
  } catch (error) {
    console.error("[facebook-groups/import-members]", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
