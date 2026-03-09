import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendForgotPasswordEmail } from "@/lib/email/auth-email";

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 heure

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    // Toujours répondre success pour ne pas révéler si l'email existe
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, password: true },
    });

    if (user && user.password) {
      // Supprimer un éventuel token précédent pour cet email
      await prisma.verificationToken.deleteMany({ where: { identifier: email } });

      // Créer un nouveau token
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      await prisma.verificationToken.create({
        data: { identifier: email, token, expires },
      });

      const appUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      await sendForgotPasswordEmail(email, resetUrl);
    }

    // Réponse identique qu'il existe ou non (anti-enumeration)
    return NextResponse.json({
      message: "Si cet email est associé à un compte, vous recevrez un lien de réinitialisation.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
