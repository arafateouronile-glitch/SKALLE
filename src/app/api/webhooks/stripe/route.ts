/**
 * 💳 Stripe Webhook
 * - checkout.session.completed : Payment Link (QuickPaymentLink) + Abonnement (User.plan)
 * - customer.subscription.updated / deleted : sync User.plan
 * - invoice.paid : renouvellement mensuel → reset crédits
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, addCredits } from "@/lib/credits";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
type Plan = "FREE" | "BUSINESS" | "AGENCY" | "SCALE";

async function setUserPlan(userId: string, plan: Plan) {
  const monthlyCredits = plan === "FREE" ? 100 : PLAN_LIMITS[plan].monthlyCredits;
  await prisma.user.update({
    where: { id: userId },
    data: { plan, credits: monthlyCredits },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_") || !webhookSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ─── Checkout (Payment Link one-off OU Abonnement)
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as import("stripe").Stripe.Checkout.Session;
    const paymentLinkId = session.payment_link as string | null;
    const prospectId = session.metadata?.prospectId as string | undefined;
    const workspaceId = session.metadata?.workspaceId as string | undefined;

    if (paymentLinkId) {
      const updated = await prisma.quickPaymentLink.findFirst({
        where: { stripePaymentLinkId: paymentLinkId },
      });
      await prisma.quickPaymentLink.updateMany({
        where: { stripePaymentLinkId: paymentLinkId },
        data: { status: "PAID", paidAt: new Date(), stripeSessionId: session.id },
      });
      if (updated) {
        const { notifyStripePaymentSuccess } = await import("@/lib/services/notifications/admin");
        await notifyStripePaymentSuccess({
          amountCents: updated.amountCents,
          currency: "eur",
          description: updated.description,
          prospectId: updated.prospectId,
          workspaceId: updated.workspaceId,
        });
      }
    }
    if (prospectId && workspaceId) {
      await prisma.prospect.updateMany({
        where: { id: prospectId, workspaceId },
        data: { status: "CONVERTED" },
      });
    }

    // Top-up : ajouter 500 crédits (paiement one-time)
    if (session.mode === "payment" && session.metadata?.type === "topup") {
      const userId = session.metadata.skalleUserId as string | undefined;
      const credits = parseInt(session.metadata.credits ?? "500", 10);
      if (userId) {
        await addCredits(userId, credits, "purchase");
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Abonnement : mettre à jour plan + crédits
    if (session.mode === "subscription" && session.metadata?.skalleUserId) {
      const plan = (session.metadata.plan as Plan) || "BUSINESS";
      if (["BUSINESS", "AGENCY", "SCALE"].includes(plan)) {
        await setUserPlan(session.metadata.skalleUserId as string, plan);
      }
    }
  }

  // ─── Abonnement mis à jour (changement de plan, renouvellement)
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as import("stripe").Stripe.Subscription;
    const userId = sub.metadata?.skalleUserId as string | undefined;
    const plan = (sub.metadata?.plan as Plan) || "BUSINESS";
    if (userId && ["BUSINESS", "AGENCY", "SCALE"].includes(plan) && sub.status === "active") {
      await setUserPlan(userId, plan);
    }
  }

  // ─── Abonnement annulé / expiré
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as import("stripe").Stripe.Subscription;
    const userId = sub.metadata?.skalleUserId as string | undefined;
    if (userId) {
      await setUserPlan(userId, "FREE");
    } else {
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: sub.customer as string },
        select: { id: true },
      });
      if (user) await setUserPlan(user.id, "FREE");
    }
  }

  // ─── Facture payée (renouvellement mensuel) → reset crédits
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as import("stripe").Stripe.Invoice;
    const subId = invoice.subscription as string | null;
    if (subId) {
      const subscription = await stripe.subscriptions.retrieve(subId);
      const userId = subscription.metadata?.skalleUserId as string | undefined;
      const plan = (subscription.metadata?.plan as Plan) || "BUSINESS";
      if (userId && ["BUSINESS", "AGENCY", "SCALE"].includes(plan)) {
        const monthlyCredits = PLAN_LIMITS[plan].monthlyCredits;
        await prisma.user.update({
          where: { id: userId },
          data: { credits: monthlyCredits },
        });
      }
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
