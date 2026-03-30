/**
 * 📎 Campaign Attachments — GET (liste) + POST (upload)
 * Taille max : 10 MB par fichier, 5 fichiers par campagne
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_CAMPAIGN = 5;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

async function getAuthorizedCampaign(campaignId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!workspace) return null;

  return prisma.emailCampaign.findFirst({
    where: { id: campaignId, workspaceId: workspace.id },
    select: { id: true },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await getAuthorizedCampaign(id, session.user.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campagne non trouvée" }, { status: 404 });
  }

  const attachments = await prisma.campaignAttachment.findMany({
    where: { campaignId: id },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ attachments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await getAuthorizedCampaign(id, session.user.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campagne non trouvée" }, { status: 404 });
  }

  // Vérifier la limite de fichiers
  const existing = await prisma.campaignAttachment.count({ where: { campaignId: id } });
  if (existing >= MAX_FILES_PER_CAMPAIGN) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES_PER_CAMPAIGN} pièces jointes par campagne` },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Type de fichier non autorisé" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 10 MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const attachment = await prisma.campaignAttachment.create({
    data: {
      campaignId: id,
      filename: file.name,
      contentType: file.type,
      size: file.size,
      data: buffer,
    },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
