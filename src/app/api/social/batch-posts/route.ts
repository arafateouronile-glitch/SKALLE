/**
 * POST /api/social/batch-posts
 *
 * Génère 30 posts sociaux ultra-performants via SSE :
 * - RAG : injecte les top viral posts de la DB comme exemples few-shot
 * - ICP : utilise le persona client stocké dans brandVoice.icp
 * - Diversité forcée : 6 hookTypes × 5 réseaux × 3 catégories
 * - Streaming : chaque post est émis dès sa génération (6 posts/call × 5 calls)
 *
 * Body JSON :
 *   { niche, networks, icp: { jobTitles, painPoints, objections, industries }, saveBrandVoice? }
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getViralPosts } from "@/lib/services/social/viral-monitor";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ICP {
  jobTitles: string[];
  painPoints: string[];
  objections: string[];
  industries: string[];
  funnelFocus: "awareness" | "consideration" | "decision";
}

interface BatchInput {
  niche: string;
  networks: string[];
  icp: ICP;
  saveBrandVoice?: boolean;
}

interface GeneratedPost {
  index: number;
  network: string;
  hookType: string;
  category: "education" | "conversion" | "awareness";
  content: string;
  hook: string;
  cta: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOOK_DISTRIBUTION = [
  "STAT",
  "QUESTION",
  "CONTRARIAN",
  "LIST",
  "STORY",
  "HOW_TO",
] as const;

const CATEGORIES: GeneratedPost["category"][] = [
  "education",
  "conversion",
  "awareness",
  "education",
  "conversion",
  "awareness",
];

// Batch of 6 posts per Claude call → 5 calls = 30 posts
const BATCH_SIZE = 6;
const TOTAL_POSTS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  brandVoice: Record<string, unknown>,
  icp: ICP,
  viralExamples: string
): string {
  const persona = brandVoice.marketingPersona as Record<string, unknown> | null;
  const tone = (persona?.tone as string) ?? (brandVoice.tone as string) ?? "professionnel";
  const uvp = (persona?.uniqueValueProp as string) ?? "";
  const pillars = Array.isArray(persona?.contentPillars)
    ? (persona.contentPillars as string[]).join(", ")
    : "";

  return `Tu es un expert en copywriting viral pour les réseaux sociaux B2B/B2C.
Tu génères des posts optimisés pour l'engagement en respectant strictement le persona client cible.

## Marque
- Ton de communication : ${tone}
- Proposition de valeur unique : ${uvp}
- Piliers de contenu : ${pillars}

## Persona client cible (ICP)
- Titres de poste : ${icp.jobTitles.join(", ")}
- Pain points principaux : ${icp.painPoints.join(" | ")}
- Objections fréquentes : ${icp.objections.join(" | ")}
- Industries cibles : ${icp.industries.join(", ")}
- Priorité funnel : ${icp.funnelFocus}

## Exemples de posts viraux réels (style à s'inspirer — NE PAS copier le contenu)
${viralExamples}

## Règles absolues
1. Chaque post DOIT parler directement au persona — utilise "vous", "votre équipe", ou le titre de poste
2. Commence par le hook fourni — accrocher en < 2 lignes
3. Contenu en français sauf si réseau = "X" (anglais natif acceptable)
4. LinkedIn : 150-250 mots, aéré, emojis modérés
5. X/Twitter : 180-280 caractères max, percutant
6. Instagram : 80-120 mots, lifestyle, 3-5 hashtags en fin
7. Facebook : 100-150 mots, ton communautaire
8. Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown.`;
}

function buildBatchPrompt(
  batchIndex: number,
  niche: string,
  networks: string[],
  icp: ICP
): string {
  const start = batchIndex * BATCH_SIZE;
  const hooks = HOOK_DISTRIBUTION.slice(start % 6).concat(HOOK_DISTRIBUTION).slice(0, BATCH_SIZE);
  const cats = CATEGORIES.slice(start % 3).concat(CATEGORIES).slice(0, BATCH_SIZE);
  const nets = networks.concat(networks).slice(0, BATCH_SIZE);

  const specs = Array.from({ length: BATCH_SIZE }, (_, i) => ({
    index: start + i + 1,
    hookType: hooks[i],
    category: cats[i],
    network: nets[i % nets.length],
  }));

  return `Génère exactement ${BATCH_SIZE} posts pour la niche "${niche}".

Pour chaque post, respecte ces spécifications :
${specs.map((s) => `Post ${s.index}: réseau=${s.network}, hookType=${s.hookType}, catégorie=${s.category}`).join("\n")}

Chaque ICP pain point à adresser : ${icp.painPoints.slice(0, 3).join(" / ")}

Format de réponse — tableau JSON de ${BATCH_SIZE} objets :
[
  {
    "index": ${start + 1},
    "network": "LINKEDIN",
    "hookType": "STAT",
    "category": "education",
    "hook": "la première phrase accrocheuse",
    "content": "le contenu complet du post",
    "cta": "l'appel à l'action final"
  },
  ...
]`;
}

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: BatchInput;
  try {
    body = await req.json() as BatchInput;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const { niche, networks, icp, saveBrandVoice } = body;
  if (!niche || !networks?.length || !icp) {
    return NextResponse.json({ error: "niche, networks et icp sont requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, brandVoice: true, name: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });
  }

  // Persist ICP into brandVoice if requested
  if (saveBrandVoice) {
    const bv = (workspace.brandVoice as Record<string, unknown>) ?? {};
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { brandVoice: { ...bv, icp } as object },
    });
  }

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const brandVoice = (workspace.brandVoice as Record<string, unknown>) ?? {};

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      }

      try {
        // 1. Fetch viral RAG examples
        send("status", { message: "Récupération des posts viraux…", step: 1, total: 4 });
        const { posts: viralPosts } = await getViralPosts({
          niche: niche.toLowerCase(),
          minLikes: 500,
          sortBy: "viralScore",
          limit: 10,
        });

        const viralExamples = viralPosts.length > 0
          ? viralPosts
              .slice(0, 8)
              .map((p, i) => `[Exemple ${i + 1} — ${p.platform} — ${p.likes} likes]\n"${p.content.slice(0, 300)}..."`)
              .join("\n\n")
          : "Aucun exemple viral disponible — génère selon les best practices.";

        // 2. Build system prompt
        send("status", { message: "Construction du contexte persona…", step: 2, total: 4 });
        const systemPrompt = buildSystemPrompt(brandVoice, icp, viralExamples);
        const claude = getClaude();
        const parser = getStringParser();

        send("status", { message: `Génération des 30 posts (${TOTAL_POSTS / BATCH_SIZE} vagues de ${BATCH_SIZE})…`, step: 3, total: 4 });

        let totalGenerated = 0;

        // 3. Generate in 5 batches of 6
        for (let batchIdx = 0; batchIdx < TOTAL_POSTS / BATCH_SIZE; batchIdx++) {
          const humanPrompt = buildBatchPrompt(batchIdx, niche, networks, icp);

          let raw: string;
          try {
            raw = await parser.invoke(
              await claude.invoke([
                new SystemMessage({ content: systemPrompt }),
                new HumanMessage(humanPrompt),
              ])
            );
          } catch (e) {
            send("error", { message: `Erreur batch ${batchIdx + 1}: ${e instanceof Error ? e.message : String(e)}` });
            continue;
          }

          // Parse JSON — strip possible markdown fences
          let posts: GeneratedPost[];
          try {
            const clean = raw.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
            posts = JSON.parse(clean) as GeneratedPost[];
          } catch {
            // Try to extract array from partial response
            const match = raw.match(/\[[\s\S]*\]/);
            if (!match) { send("error", { message: `Batch ${batchIdx + 1}: JSON invalide` }); continue; }
            try { posts = JSON.parse(match[0]) as GeneratedPost[]; }
            catch { send("error", { message: `Batch ${batchIdx + 1}: parse JSON échoué` }); continue; }
          }

          // Emit each post individually
          for (const post of posts) {
            totalGenerated++;
            send("post", { ...post, index: totalGenerated });
          }

          send("progress", { generated: totalGenerated, total: TOTAL_POSTS, batch: batchIdx + 1 });
        }

        // 4. Done
        send("status", { message: "Génération terminée !", step: 4, total: 4 });
        send("done", { total: totalGenerated });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Erreur inconnue" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
