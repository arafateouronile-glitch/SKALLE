/**
 * Logger structuré — Edge-compatible (middleware + API routes + Server Actions)
 *
 * Produit du JSON en production (parseable par Vercel / Sentry / DataDog).
 * Affiche du texte lisible en développement.
 *
 * Usage :
 *   import { logger } from "@/lib/logger";
 *   logger.info("Utilisateur connecté", { userId, workspaceId });
 *   logger.error("Erreur Stripe", { error: err.message, userId });
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV === "development";

function log(level: Level, msg: string, meta?: LogMeta): void {
  if (level === "debug" && !isDev) return;

  if (isDev) {
    const prefix = { debug: "🔍", info: "ℹ️ ", warn: "⚠️ ", error: "❌" }[level];
    const extras = meta ? ` ${JSON.stringify(meta)}` : "";
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`${prefix} [${level.toUpperCase()}] ${msg}${extras}`);
  } else {
    const entry = JSON.stringify({
      level,
      msg,
      timestamp: new Date().toISOString(),
      ...meta,
    });
    if (level === "error" || level === "warn") {
      console.error(entry);
    } else {
      console.log(entry);
    }
  }
}

export const logger = {
  debug: (msg: string, meta?: LogMeta) => log("debug", msg, meta),
  info: (msg: string, meta?: LogMeta) => log("info", msg, meta),
  warn: (msg: string, meta?: LogMeta) => log("warn", msg, meta),
  error: (msg: string, meta?: LogMeta) => log("error", msg, meta),
};
