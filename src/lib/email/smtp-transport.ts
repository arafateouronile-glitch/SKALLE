/**
 * 📧 SMTP Email Transport - Nodemailer
 *
 * Transport email via SMTP personnel (Gmail, Outlook, etc.)
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SmtpConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SendEmailParams {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 TRANSPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crée un transporter Nodemailer réutilisable
 */
export function createSmtpTransporter(config: SmtpConnectionConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true pour 465, false pour 587 (STARTTLS)
    auth: {
      user: config.username,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: false, // Accepter les certificats auto-signés
    },
  });
}

/**
 * Vérifie que la connexion SMTP fonctionne
 */
export async function verifySmtpConnection(
  config: SmtpConnectionConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createSmtpTransporter(config);
    await transporter.verify();
    transporter.close();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 ENVOI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envoie un email via SMTP
 */
export async function sendEmailViaSMTP(
  transporter: Transporter,
  params: SendEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const info = await transporter.sendMail({
      from: `"${params.fromName}" <${params.from}>`,
      to: params.to,
      replyTo: params.replyTo || params.from,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content,
      })),
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ⏱️ RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rate limiter simple pour SMTP
 * Retourne le délai en ms à attendre avant le prochain envoi
 */
export function calculateSendDelay(perMinuteLimit: number): number {
  if (perMinuteLimit <= 0) return 3000; // 3s par défaut
  return Math.ceil(60000 / perMinuteLimit); // ms entre chaque envoi
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏭 PRESETS SMTP
// ═══════════════════════════════════════════════════════════════════════════

export const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean; dailyLimit: number; perMinuteLimit: number }> = {
  gmail: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    dailyLimit: 500,
    perMinuteLimit: 20,
  },
  outlook: {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    dailyLimit: 300,
    perMinuteLimit: 30,
  },
  custom: {
    host: "",
    port: 587,
    secure: false,
    dailyLimit: 500,
    perMinuteLimit: 15,
  },
};
