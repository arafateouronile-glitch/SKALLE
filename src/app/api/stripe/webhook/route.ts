/**
 * POST /api/stripe/webhook
 *
 * Webhook Stripe — traite les événements d'abonnement et de paiement.
 *
 * Événements gérés :
 * - checkout.session.completed  → active le plan ou crédite le top-up
 * - customer.subscription.updated → met à jour le plan
 * - customer.subscription.deleted → rétrograde en FREE
 * - invoice.payment_failed       → suspend l'accès aux features premium
 *
 * Configuration requise :
 *   STRIPE_SECRET_KEY=sk_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...  (depuis le dashboard Stripe Webhooks)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";

// Crédits attribués à l'activation d'un plan
const PLAN_CREDITS: Record<string, number> = {
  BUSINESS: 600,
  AGENCY: 2000,
  SCALE: 6000,
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 500 });
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe webhook] Signature invalide:", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ─── Checkout complété ───────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const userId = session.metadata?.skalleUserId;
        if (!userId) break;

        if (session.mode === "subscription") {
          const plan = (session.metadata?.plan ?? "").toUpperCase() as Plan;
          if (!["BUSINESS", "AGENCY", "SCALE"].includes(plan)) break;

          await prisma.user.update({
            where: { id: userId },
            data: {
              plan,
              credits: PLAN_CREDITS[plan] ?? 100,
              stripeCustomerId: session.customer as string,
            },
          });
          console.log(`[Stripe] ${userId} activé sur plan ${plan}`);
        } else if (session.mode === "payment" && session.metadata?.type === "topup") {
          const creditsToAdd = parseInt(session.metadata.credits ?? "500", 10);
          await prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: creditsToAdd } },
          });
          console.log(`[Stripe] ${userId} top-up +${creditsToAdd} crédits`);
        }
        break;
      }

      // ─── Abonnement mis à jour (changement de plan) ──────────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as import("stripe").Stripe.Subscription;
        const customerId = sub.customer as string;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });
        if (!user) break;

        // Récupérer le plan depuis les métadonnées de l'abonnement
        const plan = (sub.metadata?.plan ?? "").toUpperCase() as Plan;
        if (!["BUSINESS", "AGENCY", "SCALE"].includes(plan)) break;

        const isActive = sub.status === "active" || sub.status === "trialing";
        if (isActive) {
          await prisma.user.update({
            where: { id: user.id },
            data: { plan, credits: PLAN_CREDITS[plan] ?? 100 },
          });
          console.log(`[Stripe] ${user.id} plan mis à jour → ${plan}`);
        }
        break;
      }

      // ─── Abonnement annulé → rétrograde FREE ────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as import("stripe").Stripe.Subscription;
        const customerId = sub.customer as string;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });
        if (!user) break;

        await prisma.user.update({
          where: { id: user.id },
          data: { plan: "FREE", credits: 100 },
        });
        console.log(`[Stripe] ${user.id} rétrogradé FREE (abonnement annulé)`);
        break;
      }

      // ─── Paiement échoué ─────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as import("stripe").Stripe.Invoice;
        const customerId = invoice.customer as string;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true, email: true },
        });
        if (!user) break;

        // Ne pas rétrotrader immédiatement, Stripe retentera automatiquement.
        // Juste logger — on peut envoyer un email de relance ici.
        console.warn(`[Stripe] Paiement échoué pour ${user.email}`);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[Stripe webhook] Erreur traitement:", err);
    return NextResponse.json({ error: "Erreur traitement" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Stripe requiert le body brut — désactiver le body parsing de Next.js
export const config = {
  api: { bodyParser: false },
};
