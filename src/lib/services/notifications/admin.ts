/**
 * 🔔 Notifications Admin — Monitorer la santé du SaaS en temps réel
 *
 * Envoie des alertes (Discord Webhook ou Email) à chaque événement majeur :
 * - Nouvelle inscription
 * - Paiement Stripe réussi (avec montant)
 * - Décision importante prise par l'Agent Brain
 *
 * Variables d'environnement :
 * - DISCORD_ADMIN_WEBHOOK_URL : URL du webhook Discord (prioritaire)
 * - ADMIN_NOTIFY_EMAIL : email pour fallback SMTP (optionnel)
 */

// ═══════════════════════════════════════════════════════════════════════════
// 📌 DISCORD
// ═══════════════════════════════════════════════════════════════════════════

const DISCORD_WEBHOOK = process.env.DISCORD_ADMIN_WEBHOOK_URL;

function discordEmbed(title: string, description: string, color: number, fields?: { name: string; value: string }[]) {
  return {
    embeds: [
      {
        title: `🔔 Skalle — ${title}`,
        description,
        color,
        fields: fields ?? [],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function sendDiscord(payload: { embeds: unknown[] }): Promise<boolean> {
  if (!DISCORD_WEBHOOK?.startsWith("https://")) return false;
  try {
    const res = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📌 EMAIL (fallback via Nodemailer si configuré)
// ═══════════════════════════════════════════════════════════════════════════

async function sendEmailFallback(subject: string, text: string): Promise<boolean> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return false;
  try {
    const nodemailer = await import("nodemailer");
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return false;
    const transport = nodemailer.default.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to,
      subject: `[Skalle] ${subject}`,
      text,
    });
    return true;
  } catch {
    return false;
  }
}

async function notifyAdmin(title: string, description: string, color: number, fields?: { name: string; value: string }[]) {
  const sentDiscord = await sendDiscord(discordEmbed(title, description, color, fields));
  if (!sentDiscord) {
    const text = [title, description, ...(fields?.map((f) => `${f.name}: ${f.value}`) ?? [])].join("\n");
    await sendEmailFallback(title, text);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 ÉVÉNEMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nouvelle inscription (après register).
 */
export async function notifyNewSignup(data: { email: string; name?: string | null }) {
  await notifyAdmin(
    "Nouvelle inscription",
    `Un nouvel utilisateur s'est inscrit sur Skalle.`,
    0x22c55e, // green
    [
      { name: "Email", value: data.email },
      { name: "Nom", value: data.name ?? "—" },
    ]
  );
}

/**
 * Paiement Stripe réussi (appelé depuis le webhook Stripe après mise à jour QuickPaymentLink).
 */
export async function notifyStripePaymentSuccess(data: {
  amountCents: number;
  currency: string;
  description?: string;
  prospectId?: string;
  workspaceId?: string;
}) {
  const amount = (data.amountCents / 100).toFixed(2);
  await notifyAdmin(
    "Paiement Stripe reçu",
    `Un client a encaissé via un lien de paiement Skalle.`,
    0x10b981, // emerald
    [
      { name: "Montant", value: `${amount} ${data.currency.toUpperCase()}` },
      { name: "Description", value: data.description ?? "—" },
      ...(data.workspaceId ? [{ name: "Workspace", value: data.workspaceId }] : []),
    ]
  );
}

/**
 * Décision importante prise par l'Agent Brain (ex: création d'article, envoi de DM, etc.).
 */
export async function notifyAgentBrainDecision(data: {
  actionType: string;
  summary: string;
  workspaceId: string;
  priority?: string;
}) {
  await notifyAdmin(
    "Décision Agent Brain",
    data.summary,
    0x8b5cf6, // violet
    [
      { name: "Action", value: data.actionType },
      { name: "Workspace", value: data.workspaceId },
      ...(data.priority ? [{ name: "Priorité", value: data.priority }] : []),
    ]
  );
}
