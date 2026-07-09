import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSmtpTransporter, sendEmailViaSMTP } from "@/lib/email/smtp-transport";
import { decryptIfNeeded } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const { prospectId, email, body } = await req.json();
  if (!prospectId || !email || !body?.trim()) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Validate that the prospect belongs to this workspace
  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId: workspace.id },
    select: { id: true, name: true, email: true },
  });
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  // Get SMTP config
  const smtpConfig = await prisma.smtpConfig.findFirst({
    where: { workspaceId: workspace.id, isDefault: true, isVerified: true },
  });

  if (!smtpConfig) {
    return NextResponse.json({ error: "Aucun compte email SMTP configuré. Configurez-le dans Paramètres." }, { status: 400 });
  }

  // Find the last email sequence step for subject/thread context
  const lastStep = await prisma.sequenceStep.findFirst({
    where: {
      sequence: { prospectId, workspaceId: workspace.id },
      channel: "EMAIL",
      status: { in: ["SENT", "DELIVERED", "OPENED", "REPLIED"] },
    },
    orderBy: { sentAt: "desc" },
    select: { subject: true },
  });

  const subject = lastStep?.subject ? `Re: ${lastStep.subject}` : `Re: votre message`;

  const html = body.replace(/\n/g, "<br>");

  try {
    const transporter = createSmtpTransporter({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      username: smtpConfig.username,
      password: decryptIfNeeded(smtpConfig.password),
    });

    const result = await sendEmailViaSMTP(transporter, {
      from: smtpConfig.fromEmail,
      fromName: smtpConfig.fromName,
      to: email,
      subject,
      html,
    });

    transporter.close();

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Erreur d'envoi" }, { status: 500 });
    }

    // Log as a ProspectInteraction
    await prisma.prospectInteraction.create({
      data: {
        prospectId,
        channel: "EMAIL",
        type: "MANUAL_REPLY",
        content: body.slice(0, 500),
      },
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
