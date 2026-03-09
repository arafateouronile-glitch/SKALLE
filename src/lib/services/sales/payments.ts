/**
 * 💳 One-Click Checkout — Stripe Dynamic Payment Links
 *
 * Génération de liens de paiement personnalisés (montant + description).
 * Metadata prospectId/workspaceId pour réconciliation via Webhook.
 */

import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 CONFIG — Import dynamique pour éviter "Module not found" avec Turbopack
// ═══════════════════════════════════════════════════════════════════════════

async function getStripe(): Promise<import("stripe").Stripe | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_")) return null;
  const { default: Stripe } = await import("stripe");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

/** URL de base du site (pour redirection après paiement) */
function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
}

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateQuickPaymentLinkInput {
  /** Montant en euros (ex: 997) */
  amountEuros: number;
  /** Description de l'offre (ex: "Accompagnement SEO - 3 mois") */
  description: string;
  prospectId: string;
  workspaceId: string;
}

export interface CreateQuickPaymentLinkResult {
  success: boolean;
  error?: string;
  id?: string;
  url?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📌 CRÉATION DU LIEN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie que le workspace peut utiliser Stripe (clé configurée ou Stripe Connect).
 * Pour l'instant : on considère "connecté" si STRIPE_SECRET_KEY est définie (compte global).
 */
async function isStripeAvailableForWorkspace(workspaceId: string): Promise<boolean> {
  if ((await getStripe()) === null) return false;
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { stripeConnected: true },
  });
  // Si le workspace a stripeConnected = true, on l'utilise ; sinon on autorise quand même si la clé app est définie
  return true;
}

/**
 * Crée un Payment Link Stripe dynamique et enregistre le lien en DB pour tracking.
 * - Montant converti en centimes pour Stripe.
 * - Metadata prospectId + workspaceId pour le webhook.
 * - Redirection après paiement vers /success?session_id={CHECKOUT_SESSION_ID}
 */
export async function createQuickPaymentLink(
  input: CreateQuickPaymentLinkInput
): Promise<CreateQuickPaymentLinkResult> {
  const { amountEuros, description, prospectId, workspaceId } = input;

  const stripe = await getStripe();
  if (!stripe) {
    return { success: false, error: "Stripe n'est pas configuré (STRIPE_SECRET_KEY)." };
  }

  const available = await isStripeAvailableForWorkspace(workspaceId);
  if (!available) {
    return { success: false, error: "Stripe n'est pas disponible pour ce workspace." };
  }

  const amountCents = Math.round(amountEuros * 100);
  if (amountCents < 50) {
    return { success: false, error: "Le montant minimum est 0,50 €." };
  }

  const successUrl = `${getBaseUrl()}/success?session_id={CHECKOUT_SESSION_ID}`;

  try {
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: description,
              description: description,
            },
          },
          quantity: 1,
        } as unknown as import("stripe").Stripe.PaymentLinkCreateParams.LineItem,
      ],
      metadata: {
        prospectId,
        workspaceId,
      },
      after_completion: {
        type: "redirect",
        redirect: {
          url: successUrl,
        },
      },
      billing_address_collection: "required",
    });

    const record = await prisma.quickPaymentLink.create({
      data: {
        workspaceId,
        prospectId,
        amountCents,
        description,
        stripePaymentLinkId: paymentLink.id,
        stripePaymentLinkUrl: paymentLink.url,
        status: "CREATED",
      },
    });

    return {
      success: true,
      id: record.id,
      url: paymentLink.url ?? undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Stripe";
    return { success: false, error: message };
  }
}

/**
 * Récupère le statut d'un QuickPaymentLink (pour la puce verte dans l'UI).
 */
export async function getQuickPaymentLinkStatus(
  linkId: string,
  workspaceId: string
): Promise<"CREATED" | "PAID" | null> {
  const row = await prisma.quickPaymentLink.findFirst({
    where: { id: linkId, workspaceId },
    select: { status: true },
  });
  return row?.status === "PAID" ? "PAID" : row?.status === "CREATED" ? "CREATED" : null;
}
