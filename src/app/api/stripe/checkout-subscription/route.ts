/**
 * 💳 Stripe Checkout — Création d'une session d'abonnement
 * POST body: { plan: "BUSINESS" | "AGENCY" | "SCALE" }
 * Retourne { url } pour rediriger l'utilisateur vers Stripe Checkout
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PLAN_PRICE_IDS: Record<string, string> = {
  BUSINESS: process.env.STRIPE_PRICE_BUSINESS ?? "",
  AGENCY: process.env.STRIPE_PRICE_AGENCY ?? "",
  SCALE: process.env.STRIPE_PRICE_SCALE ?? "",
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = (body.plan ?? "").toUpperCase() as keyof typeof PLAN_PRICE_IDS;
    if (!plan || !["BUSINESS", "AGENCY", "SCALE"].includes(plan)) {
      return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
    }

    const priceId = PLAN_PRICE_IDS[plan];
    if (!priceId?.startsWith("price_")) {
      return NextResponse.json(
        { error: "Stripe non configuré (STRIPE_PRICE_*). Configurez les Price IDs dans Stripe." },
        { status: 500 }
      );
    }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });

    let user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { skalleUserId: session.user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = request.headers.get("origin") ?? request.url.split("/api")[0];
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/marketing-os/settings?success=subscription`,
      cancel_url: `${origin}/marketing-os/settings?canceled=1`,
      metadata: {
        skalleUserId: session.user.id,
        plan,
      },
      subscription_data: {
        metadata: { skalleUserId: session.user.id, plan },
        trial_period_days: 0,
      },
    });

    const url = checkoutSession.url;
    if (!url) {
      return NextResponse.json({ error: "Impossible de créer la session Stripe" }, { status: 500 });
    }
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[Stripe checkout-subscription]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
