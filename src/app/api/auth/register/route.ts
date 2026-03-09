import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";
import { randomBytes } from "crypto";

const registerSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 400 }
      );
    }

    // Hash password and create user
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Create default workspace for user
    await prisma.workspace.create({
      data: {
        name: "Mon Workspace",
        domainUrl: "",
        userId: user.id,
      },
    });

    try {
      const { notifyNewSignup } = await import("@/lib/services/notifications/admin");
      await notifyNewSignup({ email: user.email, name: user.name ?? null });
    } catch {
      // Ne pas faire échouer l'inscription si la notification échoue
    }

    // Envoyer l'email de vérification (best-effort)
    try {
      const verifyToken = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await prisma.verificationToken.create({
        data: { identifier: `verify:${email}`, token: verifyToken, expires },
      });
      const appUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
      const { sendEmailVerificationEmail } = await import("@/lib/email/auth-email");
      await sendEmailVerificationEmail(email, `${appUrl}/api/auth/verify-email?token=${verifyToken}`);
    } catch {
      // L'inscription réussit même si l'envoi d'email échoue
    }

    return NextResponse.json(
      { message: "Compte créé avec succès" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue";
    return NextResponse.json(
      { error: errorMessage, details: process.env.NODE_ENV === "development" ? String(error) : undefined },
      { status: 500 }
    );
  }
}
