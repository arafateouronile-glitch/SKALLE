/**
 * POST /api/social/niche-pitch
 *
 * Génère un message de contact personnalisé (Claude) pour un créateur YouTube
 * ou un blog, dans le cadre d'un partenariat/affiliation.
 *
 * Body:
 *   type: "creator" | "blog"
 *   name: string           — nom de la chaîne ou du blog
 *   url: string            — URL du profil / article
 *   niche: string
 *   bio?: string           — description de la chaîne ou snippet du blog
 *   subscribers?: number   — pour les créateurs YouTube
 *   format?: string        — format message : "dm" | "email" | "collab"
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const SYSTEM_CREATOR = `Tu es un Partnership Manager expert en marketing d'influence.
Tu rédiges des messages de prise de contact courts, authentiques et percutants pour des créateurs YouTube.
Le ton est direct, chaleureux, jamais robotique. Max 6 lignes.
Réponds UNIQUEMENT avec le texte du message, sans objet, sans guillemets.`;

const SYSTEM_BLOG = `Tu es un Affiliate Manager B2B spécialisé dans les partenariats de contenu.
Tu rédiges des emails de prospection affiliés courts (max 7 lignes), professionnels et personnalisés pour des blogueurs.
Réponds UNIQUEMENT avec le corps de l'email (sans objet), sans guillemets.`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json() as {
    type: "creator" | "blog";
    name: string;
    url: string;
    niche: string;
    bio?: string;
    subscribers?: number;
    format?: "dm" | "email" | "collab";
  };

  const { type, name, url, niche, bio, subscribers, format = "email" } = body;
  if (!name || !niche) return NextResponse.json({ error: "name et niche requis" }, { status: 400 });

  const model = getClaude();
  const parser = getStringParser();

  let pitch: string;

  if (type === "creator") {
    const formatHint =
      format === "dm"
        ? "C'est un DM direct (court, max 4 lignes)."
        : format === "collab"
        ? "C'est une proposition de collaboration vidéo."
        : "C'est un email de partenariat affilié.";

    const human = new HumanMessage(
      `Créateur YouTube à contacter :
- Chaîne : ${name}
- URL : ${url}
- Niche : ${niche}
- Abonnés : ${subscribers ? subscribers.toLocaleString("fr-FR") : "non précisé"}
- Description : "${bio ?? "non disponible"}"
- Format souhaité : ${formatHint}

Rédige un message pour proposer un partenariat affilié à 30% de commission.`
    );
    const raw = await model.pipe(parser).invoke([new SystemMessage(SYSTEM_CREATOR), human]);
    pitch = raw.trim();
  } else {
    const human = new HumanMessage(
      `Blog à contacter :
- Nom / titre : ${name}
- URL : ${url}
- Niche : ${niche}
- Extrait / description : "${bio ?? "non disponible"}"

Rédige un email pour proposer d'intégrer Skalle (plateforme Sales & Marketing IA B2B) dans leur contenu avec un lien affilié à 30% de commission récurrente.`
    );
    const raw = await model.pipe(parser).invoke([new SystemMessage(SYSTEM_BLOG), human]);
    pitch = raw.trim();
  }

  return NextResponse.json({ pitch });
}
