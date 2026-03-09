/**
 * 💳 Stripe Checkout — Top-up 500 crédits (paiement one-time)
 * POST — authentifié, aucun body requis
 * Retourne { url } pour rediriger l'utilisateur vers Stripe Checkout
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const priceId = process.env.STRIPE_PRICE_TOPUP ?? "";
    if (!priceId?.startsWith("price_")) {
      return NextResponse.json(
        { error: "Stripe non configuré (STRIPE_PRICE_TOPUP). Créez un prix one-time de 19 € dans Stripe." },
        { status: 500 }
      );
    }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });

    const user = await prisma.user.findUnique({
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
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/marketing-os/settings?success=topup`,
      cancel_url: `${origin}/marketing-os/settings?canceled=1`,
      metadata: {
        skalleUserId: session.user.id,
        type: "topup",
        credits: "500",
      },
    });

    const url = checkoutSession.url;
    if (!url) {
      return NextResponse.json({ error: "Impossible de créer la session Stripe" }, { status: 500 });
    }
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[Stripe checkout-topup]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
