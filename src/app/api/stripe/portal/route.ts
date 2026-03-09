/**
 * 💳 Stripe Billing Portal — Redirection vers le portail client
 * POST (sans body) : crée une session du portail et retourne { url }
 * L'utilisateur peut gérer son abonnement, moyen de paiement, factures.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: "Aucun abonnement Stripe associé. Souscrivez d'abord à un plan payant." },
        { status: 400 }
      );
    }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });

    const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/marketing-os/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (e) {
    console.error("[Stripe portal]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
