import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UGC_STYLE_META } from "@/lib/services/video/prompt-builder";

// Style-specific coaching injected into the system prompt
const STYLE_COACHING: Record<string, string> = {
  ugc_app: `
Tu écris pour un créateur SaaS / tech qui partage une découverte produit depuis son bureau.
Ton : enthousiaste mais crédible. Pas de hype, pas de cri — la conviction calme d'un professionnel qui a trouvé quelque chose qui marche vraiment.
Rythme : naturel, légèrement plus rapide qu'une conversation normale. Le créateur a quelque chose à montrer.
Structure idéale : Hook (1-2 phrases) → Douleur passée (1-2 phrases) → Découverte (2-3 phrases) → Résultat chiffré si possible (1 phrase) → CTA léger (1 phrase).
Inclure des marqueurs de spontanéité : "Honnêtement...", "Ce qui m'a bluffé c'est...", "Sérieusement...", "J'ai pas compris au début mais...".`,

  ugc_produit: `
Tu écris pour un créateur qui fait une review produit en tenant le produit en main.
Ton : authentique, direct, comme si tu recommandais à un ami.
Structure : Accroche produit → Ce que tu vois/ressens → Point fort principal → Résultat ou transformation → Où le trouver.
Évite les formules corporate. Préfère "j'adore" à "excellent produit".`,

  interview_podcast: `
Tu écris pour un format interview ou podcast — une réponse à une question implicite.
Ton : posé, réfléchi, avec une vraie profondeur. Partage d'expertise, pas de vente.
Structure : Répondre à une question implicite → Nuancer avec l'expérience personnelle → Donner un insight actionnable → Conclure avec conviction.
Le style est plus lent, avec des pauses naturelles marquées par des points de suspension.`,

  temoignage: `
Tu écris un témoignage émotionnel authentique. Une histoire vraie, pas un pitch.
Ton : vulnérable au début, soulagé et reconnaissant à la fin. Le créateur n'essaie pas de convaincre — il partage.
Structure : Situation avant (difficulté, doute) → Moment de découverte → Transformation vécue → Message aux gens dans la même situation.
Utiliser "je" tout le long. Pas de "vous devriez" — juste "voilà ce que j'ai vécu".`,

  expert_autorite: `
Tu écris pour un expert qui éduque son audience sur un insight business ou tech.
Ton : calme, assuré, didactique. Le créateur parle depuis une position de savoir réel.
Structure : Affirmation forte (souvent contre-intuitive) → Explication en 2-3 points → Preuve ou exemple → Application pratique.
Utiliser des structures claires : "Premièrement...", "Ce que personne ne dit c'est...", "La vraie question c'est...".`,

  trend_hook: `
Tu écris un script à fort pouvoir d'arrêt de scroll. La première phrase DOIT être une bombe.
Ton : énergie maximale, urgence, pattern interrupt. Plus expressif que la normale.
Structure : Hook extrême (1 phrase) → Amplification (1 phrase) → Preuve ou démonstration → CTA fort et bref.
La première phrase doit donner envie de voir la suite. Commence jamais par "Bonjour" ou "Salut les amis".`,
};

// ─── Brand Voice formatter ────────────────────────────────────────────────────

function formatBrandVoice(bv: Record<string, unknown>): string {
  const lines: string[] = [];
  if (bv.offer) lines.push(`Offre : ${bv.offer}`);
  if (bv.uniqueValue) lines.push(`Valeur unique : ${bv.uniqueValue}`);
  if (bv.targetAudience) lines.push(`Audience cible : ${bv.targetAudience}`);
  if (bv.targetResult) lines.push(`Résultat client : ${bv.targetResult}`);
  if (Array.isArray(bv.productFeatures) && (bv.productFeatures as string[]).length > 0) {
    lines.push(`Fonctionnalités clés : ${(bv.productFeatures as string[]).join(", ")}`);
  }
  if (bv.socialProof) lines.push(`Preuves sociales : ${bv.socialProof}`);
  return lines.join("\n");
}

function toneInstruction(tone: unknown): string {
  if (tone === "formal") return "Ton de marque : Formel — structures claires, vocabulaire précis, crédibilité institutionnelle.";
  if (tone === "friendly") return "Ton de marque : Friendly — chaleureux, accessible, comme un ami qui partage un bon plan.";
  return "Ton de marque : Professionnel — expert et direct, conviction sans arrogance.";
}

function buildSystemPrompt(
  ugcStyle: string,
  productContext: string,
  brandVoiceContext: string,
  brandTone: unknown
): string {
  const meta = UGC_STYLE_META[ugcStyle] ?? UGC_STYLE_META.ugc_app;
  const coaching = STYLE_COACHING[ugcStyle] ?? STYLE_COACHING.ugc_app;

  const contextBlock = [brandVoiceContext, productContext].filter(Boolean).join("\n\n");

  return `Tu es un expert en copywriting UGC vidéo pour les réseaux sociaux (TikTok, Instagram Reels, YouTube Shorts).
Tu génères des scripts parlés en français, destinés à être lus à voix haute devant caméra.

STYLE ACTUEL : ${meta.emoji} ${meta.label}
${coaching}

${toneInstruction(brandTone)}

RÈGLES ABSOLUES :
- Écris UNIQUEMENT le texte parlé — pas de stage directions, pas de "[pause]", pas de titres de sections
- Durée cible : 30 à 55 secondes à voix naturelle (environ 90 à 140 mots)
- Langue : français courant, pas de franglais forcé, pas de verlan
- Pas de hashtags, pas d'emojis dans le script
- Pas de "Abonne-toi" ou "Clique sur le lien ci-dessous" — CTA discret et naturel uniquement
- Le script doit sonner comme quelqu'un qui parle spontanément, PAS comme du texte lu
- Ponctuation naturelle : virgules pour les micro-pauses, points pour les pauses respiratoires
- Pas de guillemets autour du script dans ta réponse — commence directement par le premier mot
- Utilise les termes exacts de la marque — ne les généralise pas

${contextBlock ? `CONTEXTE MARQUE :\n${contextBlock}` : ""}`.trim();
}

export async function POST(request: Request) {
  const session = (await auth()) as Session | null;
  if (!session?.user?.id) {
    return new Response("Non autorisé.", { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.startsWith("sk-ant-")) {
    return new Response("ANTHROPIC_API_KEY non configurée.", { status: 503 });
  }

  const body = (await request.json()) as {
    ugcStyle?: string;
    productContext?: string;
    currentScript?: string;
  };

  const ugcStyle = body.ugcStyle ?? "ugc_app";
  const productContext = body.productContext?.trim() ?? "";
  const currentScript = body.currentScript?.trim() ?? "";

  // Load brand voice from workspace
  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { brandVoice: true },
  });
  const bv = (workspace?.brandVoice ?? {}) as Record<string, unknown>;
  const brandVoiceContext = formatBrandVoice(bv);
  const brandTone = bv.tone;

  const userMessage = currentScript
    ? `Améliore et réécris ce script en conservant l'idée principale mais en le rendant plus percutant et naturel :\n\n${currentScript}`
    : "Génère un script UGC pour ce produit selon le style défini dans les instructions.";

  const systemPrompt = buildSystemPrompt(ugcStyle, productContext, brandVoiceContext, brandTone);

  // Call Anthropic with streaming
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    console.error("[generate-script] Anthropic error:", err);
    return new Response("Erreur lors de la génération.", { status: 502 });
  }

  // Forward the SSE stream to the client
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;

            try {
              const evt = JSON.parse(raw) as {
                type: string;
                delta?: { type: string; text?: string };
              };
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                evt.delta.text
              ) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: evt.delta.text })}\n\n`)
                );
              }
            } catch {
              // Malformed JSON line — skip
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
