/**
 * Unsubscribe token — HMAC-SHA256 signé avec NEXTAUTH_SECRET
 *
 * Format du token URL : base64url("<prospectId>.<hmac_hex>")
 * - Aucun stockage DB nécessaire
 * - Infalsifiable sans la clé secrète
 */

import { createHmac } from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? process.env.UNSUBSCRIBE_SECRET ?? "fallback-secret";

function hmac(prospectId: string): string {
  return createHmac("sha256", SECRET).update(prospectId).digest("hex");
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

/**
 * Génère un token d'unsubscribe non-devinable pour un prospect.
 */
export function generateUnsubscribeToken(prospectId: string): string {
  return base64url(`${prospectId}.${hmac(prospectId)}`);
}

/**
 * Vérifie un token et retourne le prospectId s'il est valide, null sinon.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const dotIndex = decoded.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const prospectId = decoded.slice(0, dotIndex);
    const receivedHmac = decoded.slice(dotIndex + 1);
    const expectedHmac = hmac(prospectId);

    // Comparaison à temps constant pour éviter les timing attacks
    if (receivedHmac.length !== expectedHmac.length) return null;
    let diff = 0;
    for (let i = 0; i < receivedHmac.length; i++) {
      diff |= receivedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
    }
    return diff === 0 ? prospectId : null;
  } catch {
    return null;
  }
}
