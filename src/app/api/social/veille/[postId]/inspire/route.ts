import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildInspireBrief } from "@/lib/services/social/viral-monitor";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export async function POST(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { postId } = await params;

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, domainUrl: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const brief = await buildInspireBrief(postId);
  const bv = workspace.brandVoice as Record<string, unknown> | null;

  const model = getClaude();
  const parser = getStringParser();

  const generatedPost = await model
    .pipe(parser)
    .invoke([
      new SystemMessage({
        content: `Tu es un ghostwriter LinkedIn de niveau mondial spécialisé dans l'inspiration à haute valeur — transformer un post viral existant en contenu authentique pour une autre marque.

## Principe fondamental de l'inspiration

Inspirer n'est pas copier. C'est identifier POURQUOI ce post a fonctionné (le mécanisme émotionnel) et l'appliquer à un contenu entièrement différent.

Niveaux d'inspiration :
- NIVEAU 1 (à éviter) : paraphrase avec les mots changés
- NIVEAU 2 (acceptable) : même structure, autre sujet
- NIVEAU 3 (objectif) : même mécanique émotionnelle, angle complètement original adapté à la marque

## Les 6 mécaniques émotionnelles qui rendent un post viral

1. **Validation d'identité** — le lecteur se sent "vu", compris, articulé
2. **Signal de statut** — partager ce post valorise le lecteur auprès de son réseau
3. **Appartenance tribale** — in-group/out-group clair, personne ne veut être du mauvais côté
4. **Inconfort productif** — challenge une croyance + voie de sortie concrète
5. **Curiosity gap** — tension entre ce qu'on sait et ce qu'on VEUT savoir
6. **Aspiration atteignable** — ambitieux mais réel pour la cible

## RÈGLE ZÉRO — SOURCING IMPÉRATIF

Tout chiffre, statistique, ou affirmation factuelle DOIT être sourcé.
Format : "(Source, année)" | "selon [source]" | "d'après [source] [année]"
Si aucune source disponible → observation directe formulée comme telle, ou supprimer le chiffre.
JAMAIS inventer un pourcentage. JAMAIS citer "une étude" sans nommer la source.

## Les 12 "tells" IA à ne JAMAIS écrire

1. "Il est important de noter que..." 2. "Dans un monde où..." 3. "La clé du succès réside dans..."
4. "En tant que [titre]..." 5. Trois adjectifs en liste 6. "Qu'en pensez-vous ?" seul comme CTA
7. "J'espère que cela vous aide" 8. Définition en introduction 9. "Cela dit, il faut nuancer..."
10. Listes symétriques avec emojis identiques 11. "C'est pourquoi il est essentiel de..." 12. "N'hésitez pas à me contacter"

## Texture humaine

- Variation de longueur des phrases : très courtes + moyennes alternées
- Fragments intentionnels : "Exactement ça." / "Voilà."
- Em dash pour les parenthèses
- L'imperfection calculée : une concession honnête rend le post crédible

## Format LinkedIn

- Paragraphes 1-2 lignes MAX, ligne blanche entre chaque
- 150-280 mots
- Hook dans les 210 premiers caractères
- 3 hashtags MAX en fin, jamais génériques
- Zéro lien dans le post

Réponds UNIQUEMENT avec le texte du post. Zéro introduction. Zéro explication.`,
      }),
      new HumanMessage(`Post viral source (${brief.platform}) — score ${brief.viralScore}, ${brief.angle} :

"${brief.originalContent.slice(0, 1000)}"

Type de hook détecté : ${brief.hookType}
Structure originale :
${brief.structure}

---

Marque à adapter : ${workspace.name}${workspace.domainUrl ? ` (${workspace.domainUrl})` : ""}
Secteur / niche : ${bv?.niche ?? "non définie"}
Ton de marque : ${bv?.tone ?? "direct et expert"}
Piliers de contenu : ${Array.isArray(bv?.contentPillars) ? (bv.contentPillars as string[]).join(", ") : "non définis"}
Proposition de valeur : ${bv?.valueProposition ?? "non définie"}

---

Consigne :
1. Identifie quel(s) déclencheur(s) émotionnel(s) rendent ce post viral (parmi les 6)
2. Réécris-le pour ${workspace.name} en conservant ces déclencheurs exactement
3. Adapte le contenu au secteur de la marque — les faits, exemples et chiffres doivent être pertinents pour ce secteur
4. Si le post original contient des stats, remplace-les par des données vérifiables de ton secteur — cite la source
5. Le hook doit être encore plus fort que l'original
6. Format : ${brief.platform === "TWITTER" ? "style Twitter/X, percutant, max 3 tweets enchaînés" : "style LinkedIn — paragraphes courts, saut de ligne après chaque idée, CTA final"}

Produit uniquement le texte du post. Pas de commentaire, pas d'en-tête.`),
    ]);

  return NextResponse.json({
    generatedPost,
    brief,
    workspaceId: workspace.id,
  });
}
