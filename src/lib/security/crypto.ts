/**
 * 🔐 Sécurité API bidirectionnelle
 *
 * Inbound : hash des clés API (SHA-256) — on ne stocke jamais la clé en clair.
 * Outbound : chiffrement AES-256-GCM des secrets externes — déchiffrement à la volée.
 *
 * ENCRYPTION_KEY : 64 caractères hex (32 bytes). Générer avec : openssl rand -hex 32
 */

import { createHash } from "crypto";
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from "@/lib/encryption";

// ═══════════════════════════════════════════════════════════════════════════
// INBOUND — Hash des clés API Skalle (irréversible)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hash une clé API en SHA-256.
 * Utilisé pour stocker les clés Inbound : on ne garde que l'empreinte.
 */
export function hashApiKey(plainKey: string): string {
  return createHash("sha256").update(plainKey.trim()).digest("hex");
}

/**
 * Vérifie qu'une clé en clair correspond à un hash stocké.
 */
export function verifyApiKeyHash(plainKey: string, hashedKey: string): boolean {
  return hashApiKey(plainKey) === hashedKey;
}

/**
 * Génère un préfixe d'affichage sécurisé (ex: "sk_...a8f9").
 */
export function getKeyDisplayPrefix(fullKey: string): string {
  const trimmed = fullKey.trim();
  if (trimmed.length <= 8) return "****";
  return trimmed.slice(-4);
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTBOUND — Chiffrement des secrets externes (réversible, à la volée)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chiffre un secret (clé API externe) en AES-256-GCM.
 * Retourne la chaîne complète "iv:authTag:ciphertext" et l'iv pour stockage optionnel.
 */
export function encryptSecret(plainText: string): { encrypted: string; iv: string } {
  const encrypted = aesEncrypt(plainText);
  const iv = encrypted.split(":")[0] ?? "";
  return { encrypted, iv };
}

/**
 * Déchiffre un secret stocké (format "iv:authTag:ciphertext").
 * iv est optionnel si encrypted contient déjà le format complet.
 */
export function decryptSecret(encryptedData: string, _iv?: string): string {
  return aesDecrypt(encryptedData);
}
