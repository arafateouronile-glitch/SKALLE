/**
 * Enrichit le brandVoice d'un workspace en analysant son site web avec Claude.
 * Extrait : offre, valeur unique, fonctionnalités, audience, ton, preuves sociales.
 *
 * Stratégie de merge : les champs déjà remplis manuellement ne sont PAS écrasés.
 */

import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/prisma";

// ─── Fetch + nettoyage HTML ───────────────────────────────────────────────────

async function fetchWebsiteText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SKALLE-Research/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch échoué : HTTP ${res.status} sur ${url}`);

  const html = await res.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8_000); // Claude analyse les 8000 premiers chars

  if (text.length < 100) throw new Error("Contenu insuffisant récupéré sur le site");
  return text;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebsiteExtraction {
  offer: string;
  uniqueValue: string;
  targetResult: string;
  targetAudience: string;
  productFeatures: string[];
  socialProof: string | null;
  tone: "formal" | "professional" | "friendly";
}

// ─── Enrichissement ───────────────────────────────────────────────────────────

export async function enrichBrandVoiceFromWebsite(workspaceId: string): Promise<{
  enriched: boolean;
  extracted: WebsiteExtraction;
  mergedFields: string[];
}> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, brandVoice: true },
  });
  if (!workspace) throw new Error("Workspace introuvable");

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const websiteUrl = (bv.websiteUrl as string | undefined)?.trim();
  if (!websiteUrl) throw new Error("Aucune URL de site configurée dans le brand voice");

  const pageText = await fetchWebsiteText(websiteUrl);

  const claude = getClaude();

  const system = new SystemMessage({
    content: [
      {
        type: "text",
        text: `Tu es un expert en analyse de produit et marketing B2B.
À partir du contenu brut d'un site web, tu extrais les informations clés pour alimenter le contexte de marque d'un outil de prospection IA.
Sois précis, concret, et utilise le vocabulaire exact du site (pas de généralités).`,
        cache_control: { type: "ephemeral" },
      },
    ],
  });

  const human = new HumanMessage(`
Entreprise : ${workspace.name}
URL analysée : ${websiteUrl}

CONTENU DU SITE :
${pageText}

Extrais les informations de marque. Retourne CE JSON EXACT (rien d'autre, pas de markdown) :
{
  "offer": "Description du produit/service en 1-2 phrases concrètes (cite les termes du site)",
  "uniqueValue": "Ce qui différencie vraiment ce produit — une phrase précise",
  "targetResult": "Le résultat mesurable que le client obtient (ex: 'automatiser la gestion administrative en 1 clic')",
  "targetAudience": "À qui s'adresse ce produit — aussi précis que possible (ex: 'organismes de formation professionnelle')",
  "productFeatures": ["fonctionnalité nommée 1", "fonctionnalité nommée 2", "fonctionnalité nommée 3"],
  "socialProof": "Preuves sociales, clients cités, certifications, labels — ou null si aucune",
  "tone": "formal | professional | friendly"
}
`);

  const response = await claude.invoke([system, human]);
  const raw =
    typeof response.content === "string"
      ? response.content
      : ((response.content as Array<{ text?: string }>)[0]?.text ?? "");

  const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
  const extracted = JSON.parse(cleaned) as WebsiteExtraction;

  // Merge : les champs existants non vides priment sur ceux extraits automatiquement
  const merged: Record<string, unknown> = { ...extracted };
  const mergedFields: string[] = [];

  for (const key of Object.keys(extracted) as Array<keyof WebsiteExtraction>) {
    const existing = bv[key];
    const isSet =
      existing !== undefined &&
      existing !== null &&
      existing !== "" &&
      !(Array.isArray(existing) && (existing as unknown[]).length === 0);

    if (isSet) {
      // Le champ manuel prend le dessus — on ne touche pas
      merged[key] = existing;
    } else {
      mergedFields.push(key);
    }
  }

  // Champs système — toujours mis à jour
  merged.websiteUrl = websiteUrl;
  merged.websiteEnrichedAt = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { brandVoice: { ...bv, ...merged } as any },
  });

  return { enriched: true, extracted, mergedFields };
}
