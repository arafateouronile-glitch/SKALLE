import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VERIFY_PREFIX = "verify:";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const appUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";

  if (!token) {
    return NextResponse.redirect(`${appUrl}/login?error=token_manquant`);
  }

  try {
    const verification = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verification || !verification.identifier.startsWith(VERIFY_PREFIX)) {
      return NextResponse.redirect(`${appUrl}/login?error=lien_invalide`);
    }

    if (verification.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.redirect(`${appUrl}/login?error=lien_expire`);
    }

    const email = verification.identifier.slice(VERIFY_PREFIX.length);

    // Marquer l'email comme vérifié
    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });

    // Supprimer le token utilisé
    await prisma.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(`${appUrl}/login?verified=true`);
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.redirect(`${appUrl}/login?error=erreur_serveur`);
  }
}
