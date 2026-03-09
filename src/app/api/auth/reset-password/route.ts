import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Chercher le token de reset
    const verification = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verification) {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    if (verification.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.json({ error: "Ce lien a expiré. Veuillez recommencer." }, { status: 400 });
    }

    // Trouver l'utilisateur par l'email (identifier)
    const user = await prisma.user.findUnique({
      where: { email: verification.identifier },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 400 });
    }

    // Mettre à jour le mot de passe
    const hashed = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    // Supprimer le token utilisé
    await prisma.verificationToken.delete({ where: { token } });

    return NextResponse.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
