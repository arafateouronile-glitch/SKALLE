"use server";

/**
 * 💰 Credit Management Actions
 * 
 * Actions serveur pour gérer les crédits utilisateur
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCredits, getCreditStats, PLAN_LIMITS, type CreditStats } from "@/lib/credits";

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// ➕ AJOUTER DES CRÉDITS (réservé aux admins)
// ═══════════════════════════════════════════════════════════════════════════

function isAdmin(email: string | null | undefined): boolean {
  const list = process.env.SKALLE_ADMIN_EMAILS;
  if (!list?.trim()) return false;
  const emails = list.split(",").map((e) => e.trim().toLowerCase());
  return email ? emails.includes(email.toLowerCase()) : false;
}

/**
 * Ajoute des crédits à l'utilisateur connecté.
 * Réservé aux admins (SKALLE_ADMIN_EMAILS dans .env).
 * En production, ne pas exposer d'UI pour cette action.
 */
export async function addCreditsToUser(
  amount: number,
  reason: "purchase" | "bonus" | "monthly_reset" | "referral" = "bonus"
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  try {
    const session = await requireAuth();
    if (!isAdmin(session.user?.email)) {
      return { success: false, error: "Action réservée aux administrateurs" };
    }
    const result = await addCredits(session.user!.id!, amount, reason);
    if (result.success) {
      return { success: true, newBalance: result.newBalance };
    }
    return { success: false, error: "Erreur lors de l'ajout de crédits" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 STATISTIQUES DE CRÉDITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les infos compte pour la page Paramètres (profil + plan + crédits + Stripe)
 */
export async function getCurrentUserSettings(): Promise<{
  success: boolean;
  user?: {
    name: string | null;
    email: string;
    plan: "FREE" | "BUSINESS" | "AGENCY" | "SCALE";
    credits: number;
    monthlyCredits: number;
    hasStripeCustomer: boolean;
    workspaceId: string | null;
    brandType: "PERSONAL_BRAND" | "B2B" | "B2C" | null;
  };
  error?: string;
}> {
  try {
    const session = await requireAuth();
    const u = await prisma.user.findUnique({
      where: { id: session.user!.id! },
      select: {
        name: true,
        email: true,
        plan: true,
        credits: true,
        stripeCustomerId: true,
        workspaces: { select: { id: true, brandType: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (!u) return { success: false, error: "Utilisateur non trouvé" };
    const monthlyCredits = PLAN_LIMITS[u.plan].monthlyCredits;
    const workspace = u.workspaces[0] ?? null;
    return {
      success: true,
      user: {
        name: u.name,
        email: u.email,
        plan: u.plan,
        credits: u.credits,
        monthlyCredits,
        hasStripeCustomer: !!u.stripeCustomerId,
        workspaceId: workspace?.id ?? null,
        brandType: workspace?.brandType ?? null,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Erreur",
    };
  }
}

/**
 * Récupère les statistiques de crédits de l'utilisateur connecté
 */
export async function getUserCreditStats(): Promise<{
  success: boolean;
  stats?: CreditStats;
  error?: string;
}> {
  try {
    const session = await requireAuth();
    const stats = await getCreditStats(session.user!.id!);
    
    if (!stats) {
      return { success: false, error: "Impossible de récupérer les statistiques" };
    }
    
    return { success: true, stats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}
