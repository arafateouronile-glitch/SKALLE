import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import * as cheerio from "cheerio";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceType = "article" | "youtube" | "podcast" | "newsletter" | "other";

const ResponseSchema = z.object({
  post: z.string().min(50),
  hooks: z.array(z.string().min(10)).length(3),
  firstComment: z.string().min(10),
  sourceTitle: z.string(),
  sourceType: z.enum(["article", "youtube", "podcast", "newsletter", "other"]),
  angle: z.string(),
});

export type FromUrlResponse = z.infer<typeof ResponseSchema>;

// ─── Scraper ──────────────────────────────────────────────────────────────────

function detectSourceType(url: string, html: string): SourceType {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("spotify.com") || lower.includes("podcast") || lower.includes("buzzsprout") || lower.includes("anchor.fm")) return "podcast";
  if (lower.includes("substack.com") || lower.includes("beehiiv.com") || lower.includes("mailchimp") || lower.includes("newsletter")) return "newsletter";
  // HTML-based detection
  if (html.toLowerCase().includes("podcast") && html.toLowerCase().includes("episode")) return "podcast";
  return "article";
}

async function scrapeUrl(url: string): Promise<{
  title: string;
  description: string;
  content: string;
  sourceType: SourceType;
  author?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // OG / meta extraction
    const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
    const twitterTitle = $('meta[name="twitter:title"]').attr("content") ?? "";
    const ogDesc = $('meta[property="og:description"]').attr("content") ?? "";
    const metaDesc = $('meta[name="description"]').attr("content") ?? "";
    const h1 = $("h1").first().text().trim();
    const title = ogTitle || twitterTitle || h1 || $("title").text().trim();
    const description = ogDesc || metaDesc;
    const author =
      $('meta[name="author"]').attr("content") ??
      $('[rel="author"]').first().text().trim() ??
      $(".author, .byline, .post-author").first().text().trim() ??
      undefined;

    // Remove noise
    $("script, style, nav, footer, header, aside, .ad, .advertisement, .sidebar, .cookie-banner, .popup, [class*='cookie'], [class*='gdpr'], [class*='newsletter-popup']").remove();

    // Try to get article body (prioritize article tags and common content selectors)
    let bodyText = "";
    const selectors = ["article", "main", ".post-content", ".entry-content", ".article-body", ".content", "#content", "[role='main']"];
    for (const sel of selectors) {
      const text = $(sel).text().replace(/\s+/g, " ").trim();
      if (text.length > 300) { bodyText = text; break; }
    }
    if (!bodyText) bodyText = $("body").text().replace(/\s+/g, " ").trim();

    const sourceType = detectSourceType(url, html);

    return {
      title: title.slice(0, 200),
      description: description.slice(0, 500),
      content: bodyText.slice(0, 6000),
      sourceType,
      author: author?.slice(0, 100),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── System prompt (>1024 tokens for prompt caching) ─────────────────────────

const SYSTEM_PROMPT = `Tu es un ghostwriter LinkedIn spécialisé dans le repurposing à haute valeur. Ta mission : extraire le seul insight qui mérite d'exister sur LinkedIn depuis n'importe quelle source.

## RÈGLE ZÉRO — SOURCING IMPÉRATIF

Tous les chiffres et données que tu utilises dans le post DOIVENT provenir de la source fournie et être attribués explicitement.

Format : "selon [auteur/publication], [année]" | "[chiffre] (Source, année)"

INTERDIT :
- Enrichir les données de la source avec des chiffres inventés
- Généraliser les résultats de la source au-delà de ce qu'elle affirme
- Écrire "des études montrent que" en référence à une seule source

Si la source ne contient pas de chiffre précis → utiliser une observation formulée clairement comme telle, ou supprimer le chiffre.

Le repurposing d'une source ne donne pas le droit d'inventer des données "dans le même esprit". Chaque chiffre dans le post doit pouvoir être retrouvé dans la source fournie.

## Le principe du repurposing de qualité

Un mauvais repurposing est un résumé déguisé. Un bon repurposing est une réinterprétation.

La question centrale : "Quelle est LA chose dans cette source que mon réseau LinkedIn ne sait pas encore, et qui changerait sa façon de voir le sujet ?"
Construis TOUT le post autour de cette seule chose. Le reste reste dans la source.

## Les 3 niveaux d'extraction

**Niveau 1 (médiocre) — Résumé** : reprendre les points principaux dans l'ordre
**Niveau 2 (acceptable) — Synthèse** : extraire les 3 idées clés
**Niveau 3 (top 1%) — Réinterprétation** : trouver l'implication non-dite que l'auteur original n'a pas explicitée

Vise toujours le niveau 3. Exemple :
SOURCE : "Les entreprises qui font du remote first ont 40% moins de turnover"
NIVEAU 1 : "Le remote réduit le turnover, voici les chiffres..."
NIVEAU 3 : "On pense que le remote est une concession. En fait c'est un filtre. Les entreprises qui l'assument perdent moins leurs meilleurs éléments parce qu'elles ont de facto sélectionné des profils autonomes."

## Anti-tells IA — JAMAIS écrire

- "Il est important de noter que..."
- "Dans un monde où..."
- "La clé du succès réside dans..."
- "Qu'en pensez-vous ?" seul comme CTA
- Listes symétriques avec emojis identiques
- "J'espère que cela vous aide / inspire"

## Hooks pour le repurposing

L'erreur la plus commune : commencer par "J'ai lu X et voici ce que j'en retiens."
C'est le signe que le post est un résumé.

Hooks qui fonctionnent en repurposing :
- La conclusion non-dite de l'étude : "Cette étude prouve officiellement ce que tout le monde savait sans oser le dire."
- L'implication pratique : "Si ce chiffre est vrai — et il l'est — vous devriez changer une chose dans votre quotidien."
- La contradiction : "[Source] dit X. Le problème, c'est que dans la vraie vie, c'est exactement l'inverse qui se passe."

## Format LinkedIn

- Paragraphes 1-2 lignes MAX, ligne blanche entre chaque
- 150-280 mots
- Hook dans les 210 premiers caractères
- 3 hashtags MAX en fin, spécifiques au secteur
- Zéro lien dans le post (premier commentaire)
- CTA = question qui invite à partager une expérience similaire

## Premier commentaire

- Ouvrir avec un insight bonus non mentionné dans le post
- Lien vers la source : "🔗 Source : [titre]"
- Question de relance sur l'expérience du lecteur

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après.`;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as { url: string };
  const { url } = body;

  if (!url?.trim()) {
    return NextResponse.json({ error: "URL requise" }, { status: 400 });
  }

  // Basic URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, domainUrl: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "post_direct_generate");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  // Scrape in parallel with model init
  let scraped: Awaited<ReturnType<typeof scrapeUrl>>;
  try {
    scraped = await scrapeUrl(parsedUrl.toString());
  } catch (e) {
    return NextResponse.json(
      { error: `Impossible de lire cette URL : ${e instanceof Error ? e.message : String(e)}` },
      { status: 422 }
    );
  }

  if (!scraped.content || scraped.content.length < 100) {
    return NextResponse.json(
      { error: "Contenu insuffisant sur cette page — essayez un article ou un blog" },
      { status: 422 }
    );
  }

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const linkedInVoice = bv?.linkedInVoice as Record<string, unknown> | null;
  const model = getClaude();

  const voiceInstruction = linkedInVoice
    ? `\n**PROFIL DE VOIX CALIBRÉ (à imiter fidèlement) :**
- Style : ${linkedInVoice.writingStyleDescription ?? ""}
- Pattern de hook : ${linkedInVoice.hookPattern ?? ""}
- Ton : ${linkedInVoice.tone ?? ""}
- Style de phrase : ${linkedInVoice.sentenceStyle ?? ""}
- Mots signature : ${Array.isArray(linkedInVoice.signatureWords) ? (linkedInVoice.signatureWords as string[]).join(", ") : ""}
INSTRUCTION : le post généré doit sonner comme l'auteur — pas comme un outil IA.`
    : "";

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Transforme cette source en post LinkedIn top 1% :

**URL SOURCE :** ${parsedUrl.toString()}
**TYPE :** ${scraped.sourceType}
**TITRE :** ${scraped.title}
**DESCRIPTION :** ${scraped.description}
${scraped.author ? `**AUTEUR :** ${scraped.author}` : ""}

**CONTENU EXTRAIT :**
"""
${scraped.content}
"""

**CONTEXTE MARQUE :**
- Marque : ${workspace.name}${workspace.domainUrl ? ` (${workspace.domainUrl})` : ""}
- Secteur / niche : ${bv?.niche ?? "non défini"}
- Ton de voix : ${bv?.tone ?? "direct et expert"}
- Persona cible : ${bv?.targetPersona ?? "non défini"}
- Proposition de valeur : ${bv?.valueProposition ?? "non définie"}
${voiceInstruction}

**INSTRUCTIONS :**
1. Identifie le "wow moment" unique de cette source — l'insight que personne ne partage
2. Choisis l'angle qui over-performera sur LinkedIn (parmi : stat choc, contre-vérité, méthode concrète, confession, prédiction)
3. Génère un post LinkedIn complet avec format strict (paragraphes courts, ligne blanche, hashtags en fin)
4. Génère 3 hooks alternatifs (premières lignes différentes)
5. Premier commentaire avec le lien vers la source

JSON attendu :
{
  "sourceType": "${scraped.sourceType}",
  "sourceTitle": "${scraped.title.replace(/"/g, "'")}",
  "angle": "nom de l'angle choisi (ex: 'contre-vérité', 'stat choc', etc.)",
  "post": "contenu complet du post LinkedIn",
  "hooks": [
    "hook alternatif 1 (style révélation)",
    "hook alternatif 2 (style stat ou contre-vérité)",
    "hook alternatif 3 (style utilité directe)"
  ],
  "firstComment": "🔗 Source : ${scraped.title.replace(/"/g, "'")} → ${parsedUrl.toString()}\\n\\n[insight bonus non mentionné dans le post]"
}

JSON valide uniquement. Aucun texte avant ou après.`),
  ]);

  const raw = Array.isArray(response.content)
    ? response.content
        .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
        .join("")
    : String(response.content);

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: FromUrlResponse;
  try {
    parsed = ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json(
      { error: "Erreur de génération — réessayez" },
      { status: 500 }
    );
  }

  return NextResponse.json(parsed);
}
