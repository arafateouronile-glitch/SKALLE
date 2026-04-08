import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Chiffrement AES-256-GCM pour les secrets en base de données (mots de passe SMTP…)
 *
 * Nécessite la variable d'environnement :
 *   ENCRYPTION_KEY = 64 caractères hexadécimaux (32 bytes)
 *   Générer avec : openssl rand -hex 32
 *
 * Format stocké en DB : "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY manquante ou invalide — doit être 64 caractères hex (openssl rand -hex 32)"
    );
  }
  return Buffer.from(hex, "hex");
}

/** Chiffre un texte en clair. Retourne une chaîne "iv:authTag:ciphertext" en hex. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommandé pour GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // 16 bytes par défaut

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Déchiffre une chaîne produite par `encrypt()`. */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Format de chiffrement invalide");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * Retourne true si la valeur correspond au format chiffré "iv:authTag:data".
 * Permet la compatibilité avec les données en clair existantes en DB.
 * IV = 12 bytes → 24 hex chars | AuthTag = 16 bytes → 32 hex chars
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return (
    parts.length === 3 &&
    parts[0].length === 24 &&
    parts[1].length === 32 &&
    /^[0-9a-f]+$/i.test(parts[0]) &&
    /^[0-9a-f]+$/i.test(parts[1])
  );
}

/**
 * Déchiffre si nécessaire. Compatible avec les valeurs en clair existantes (migration progressive).
 * À terme, toutes les valeurs devraient être chiffrées.
 */
export function decryptIfNeeded(value: string): string {
  if (isEncrypted(value)) {
    try {
      return decrypt(value);
    } catch (err) {
      throw new Error(
        "Impossible de déchiffrer le mot de passe SMTP. " +
        "Vérifiez que ENCRYPTION_KEY est identique entre l'environnement où le SMTP a été configuré et celui où il est utilisé. " +
        `(cause: ${err instanceof Error ? err.message : String(err)})`
      );
    }
  }
  // Valeur en clair (données legacy avant migration)
  return value;
}
