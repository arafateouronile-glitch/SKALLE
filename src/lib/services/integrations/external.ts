/**
 * Utilitaire pour récupérer et déchiffrer les clés d'intégrations externes.
 * Chaque provider stocke sa clé en AES-256-GCM dans ExternalIntegration.
 */

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import type { ExternalIntegrationProvider } from "@/lib/constants/integrations";

/**
 * Récupère et déchiffre la clé d'une intégration externe pour un workspace.
 * Retourne null si l'intégration n'est pas configurée.
 */
export async function getExternalIntegrationKey(
  workspaceId: string,
  provider: ExternalIntegrationProvider
): Promise<string | null> {
  const integration = await prisma.externalIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
    select: { encryptedApiKey: true },
  });

  if (!integration) return null;

  try {
    return decryptSecret(integration.encryptedApiKey);
  } catch {
    return null;
  }
}

/**
 * Pour WordPress : déchiffre et parse le JSON stocké {siteUrl, username, applicationPassword}.
 */
export async function getWordPressConfig(workspaceId: string): Promise<{
  siteUrl: string;
  username: string;
  applicationPassword: string;
} | null> {
  const key = await getExternalIntegrationKey(workspaceId, "WORDPRESS");
  if (!key) return null;

  try {
    return JSON.parse(key) as {
      siteUrl: string;
      username: string;
      applicationPassword: string;
    };
  } catch {
    return null;
  }
}
