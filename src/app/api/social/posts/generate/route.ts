import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export type EmotionalTrigger =
  | "curiosity_gap"
  | "identity_validation"
  | "tribal_belonging"
  | "productive_discomfort"
  | "aspiration"
  | "status_signal";

export type PostFormat = "post_court" | "thread" | "carrousel" | "story" | "email";
export type PostPlatform = "LINKEDIN" | "TWITTER" | "INSTAGRAM" | "FACEBOOK";

const TRIGGER_LABELS: Record<EmotionalTrigger, string> = {
  curiosity_gap:           "Curiosity gap — le lecteur est incapable de ne pas scroller pour savoir la suite",
  identity_validation:     "Validation d'identité — le lecteur se sent enfin compris, vu, articulé",
  tribal_belonging:        "Appartenance tribale — in-group / out-group clair, personne ne veut être du mauvais côté",
  productive_discomfort:   "Inconfort productif — challenge une croyance, mais avec une voie de sortie concrète",
  aspiration:              "Aspiration et possibilité — l'outcome est ambitieux mais atteignable pour la cible",
  status_signal:           "Signal de statut — le lecteur partage parce que ça le valorise auprès de son réseau",
};

const FORMAT_LABELS: Record<PostFormat, string> = {
  post_court: "Post court (< 300 mots, percutant)",
  thread:     "Thread (5-8 posts enchaînés, chaque tweet = une idée)",
  carrousel:  "Carrousel (10 slides max — titre accrocheur + corps + CTA final)",
  story:      "Story / Reel (script 30-60 secondes)",
  email:      "Email newsletter (sujet percutant + corps engageant + CTA)",
};

const PLATFORM_FORMAT_GUIDE: Record<PostPlatform, string> = {
  LINKEDIN:  "Paragraphes de 1-2 lignes max. Saut de ligne après chaque idée. Jamais de mur de texte. CTA final = question ou micro-engagement. Ton : direct, expert, premier degré.",
  TWITTER:   "Chaque tweet doit pouvoir être cité seul. Tension narrative entre les tweets. 280 chars max par tweet. Premier tweet = hook pur.",
  INSTAGRAM: "Ligne 1 = hook qui coupe le scroll. Corps = valeur compressée. Break esthétique avant les hashtags. 15-20 hashtags en fin. Ton aspirationnel.",
  FACEBOOK:  "Accroche storytelling ou question communauté. Ton chaleureux, accessible. CTA à commentaire. Corps court avec contexte humain.",
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json() as {
    platform: PostPlatform;
    format: PostFormat;
    trigger: EmotionalTrigger;
    subject: string;
  };

  const { platform, format, trigger, subject } = body;
  if (!platform || !format || !trigger || !subject?.trim()) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
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

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const model = getClaude();
  const parser = getStringParser();

  const content = await model.pipe(parser).invoke([
    new SystemMessage({
      content: `Tu es un architecte de contenu viral spécialisé en psychologie de l'engagement.

Ta mission : créer un post qui ne délivre pas de l'information — il déclenche une réponse émotionnelle si forte que le lecteur ne peut pas scroller sans réagir. L'algorithme LinkedIn optimise pour l'intensité émotionnelle, pas pour la valeur informationnelle. Ton travail : ingénier cette intensité.

## Les 6 déclencheurs émotionnels (pour contexte)

1. **Curiosity gap** — Tension entre ce que le lecteur sait et ce qu'il VEUT savoir. Nombres précis + savoir exclusif + inattendu.
2. **Validation d'identité** — Articule ce que la cible ressent mais n'a jamais dit. Quand ils se sentent "vus", ils commentent par réflexe.
3. **Appartenance tribale** — In-group/out-group clair. Personne ne veut être du mauvais côté.
4. **Inconfort productif** — L'inconfort crée l'action. Mais il DOIT avoir une sortie claire, sinon il repousse.
5. **Aspiration et possibilité** — L'outcome doit sembler ambitieux MAIS atteignable. Impressionnant sans être irréel.
6. **Signal de statut** — Le lecteur partage ce qui le fait paraître bien. Question : qu'est-ce que partager dit sur lui ?

## Structure émotionnelle obligatoire

hook (déclencheur principal) → problème articulé (validation d'identité) → nous vs eux (appartenance) → preuve ou insight (crédibilité) → outcome possible (aspiration) → CTA micro-engagement

## Règle absolue sur les données

- N'utilise JAMAIS de statistiques inventées
- Chaque chiffre doit être sourcé inline : "selon LinkedIn", "d'après HubSpot 2023", "McKinsey rapporte que…"
- Si pas de donnée vérifiable → anecdote, observation directe, ou formulation sans chiffre
- Les résultats personnels ("j'ai signé 3 clients en une semaine") sont autorisés — c'est de la preuve vécue

## Hook — règle absolue

La première ligne DOIT arrêter le scroll. Techniques autorisées :
- Contre-vérité choc ("La plupart des [X] font exactement l'inverse de ce qu'ils devraient")
- Chiffre précis sourcé ("87% des fondateurs B2B sous-estiment X — selon Gartner 2024")
- Confession courte ("J'ai perdu 18 mois à optimiser la mauvaise chose")
- Pattern interrupt (rupture totale avec ce qu'on attend de lire)
- Question identitaire ("Tu fais encore [X] ? Voilà pourquoi tu stagues.")

Réponds UNIQUEMENT avec le texte du post. Zéro introduction. Zéro explication. Zéro méta-commentaire.`,
    }),
    new HumanMessage(`Crée un post en utilisant le déclencheur émotionnel principal suivant :

**DÉCLENCHEUR PRINCIPAL : ${TRIGGER_LABELS[trigger]}**

Construis tout le post autour de ce déclencheur. C'est le moteur émotionnel central.

---

**Sujet / angle :** ${subject.trim()}

**Plateforme :** ${platform}
**Format :** ${FORMAT_LABELS[format]}
**Guide plateforme :** ${PLATFORM_FORMAT_GUIDE[platform]}

---

**Marque :** ${workspace.name}${workspace.domainUrl ? ` — ${workspace.domainUrl}` : ""}
**Secteur / niche :** ${bv?.niche ?? "non définie"}
**Ton de marque :** ${bv?.tone ?? "direct et expert"}
**Piliers de contenu :** ${Array.isArray(bv?.contentPillars) ? (bv.contentPillars as string[]).join(", ") : "non définis"}
**Proposition de valeur :** ${bv?.valueProposition ?? "non définie"}
**Persona cible :** ${bv?.targetPersona ?? "non défini"}

---

Instructions :
1. Hook ligne 1 — arrête le scroll, n'est JAMAIS une question générique
2. Applique le déclencheur "${TRIGGER_LABELS[trigger]}" comme moteur émotionnel central
3. Pile la structure : hook → problème → nous vs eux → preuve → aspiration → CTA
4. Chiffres sourcés uniquement — ou zéro chiffre
5. Format natif ${platform} : ${PLATFORM_FORMAT_GUIDE[platform]}

Produits uniquement le texte du post. Rien d'autre.`),
  ]);

  return NextResponse.json({ content, platform, format, trigger });
}
