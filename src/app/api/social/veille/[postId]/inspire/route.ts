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
        content: `Tu es un architecte de contenu viral spécialisé en psychologie de l'engagement.
Ta mission : créer du contenu qui ne délivre pas de l'information — il déclenche une réponse émotionnelle si forte que le lecteur ne peut pas scroller sans réagir.

## CADRE PSYCHOLOGIQUE — Les 6 déclencheurs du contenu viral

**1. Validation d'identité** — Articule ce que la cible pense mais n'a jamais osé dire. Quand ils se sentent "vus", ils commentent instantanément.
Exemple : "Tu ne perds pas de clients à cause de ton offre. Tu les perds parce que tu as peur d'afficher ton vrai tarif."

**2. Signal de statut** — Le lecteur partage ce qui le fait PARAÎTRE bien auprès de son réseau. Pose-toi la question : "Qu'est-ce que partager ce post dit sur la personne qui le partage ?"

**3. Appartenance tribale** — Crée un in-group/out-group clair. Personne ne veut être dans le mauvais camp.
Exemple : "Il y a deux types de fondateurs : ceux qui obsèdent sur leur nombre d'abonnés, et ceux qui obsèdent sur leur ARR."

**4. Inconfort productif** — L'inconfort crée l'action, pas le confort. Mais l'inconfort DOIT avoir une voie de sortie, sinon il rebute.
Exemple : "Ton 'lead magnet', c'est un PDF de 3 pages fait en une après-midi. Tu demandes à des prospects de t'échanger leurs coordonnées contre quelque chose que tu ne paierais pas 5€."

**5. Curiosity gap** — Crée une tension entre ce que le lecteur sait et ce qu'il VEUT savoir. Nombres spécifiques + savoir exclusif + inattendu.
Exemple : "Le post LinkedIn qui m'a booké 47 appels en 72h (le framework exact ci-dessous)."

**6. Aspiration et possibilité** — L'outcome doit sembler ambitieux MAIS atteignable. Impressionnant sans être irréel.
Exemple : "Comment je suis passé de 0 à 42k€ MRR en 90 jours en utilisant uniquement LinkedIn."

## RÈGLES ABSOLUES

**DONNÉES ET CHIFFRES — règle stricte :**
- N'utilise JAMAIS de statistiques inventées ou approximatives
- N'utilise que des chiffres que tu peux sourcer précisément : cite la source entre parenthèses ou inline (ex: "selon une étude LinkedIn 2023", "d'après McKinsey", "HubSpot rapporte que…")
- Si tu n'as pas de stat vérifiable, utilise l'anecdote, l'observation, ou le témoignage sans chiffre — c'est plus honnête et souvent plus impactant
- Les chiffres personnels (ex: "j'ai signé 3 clients en une semaine") sont autorisés — c'est de l'expérience directe, pas de la statistique

**HOOK — impératif :**
- La première ligne DOIT arrêter le scroll. C'est la seule chose qui compte au début.
- Techniques : contre-vérité choc, chiffre inattendu sourcé, question identitaire, confession courte, pattern interrupt
- Jamais de question générique ("Saviez-vous que…") — trop vu, trop ignoré
- Le hook doit viser l'identité ou la douleur de la cible directement

**STRUCTURE émotionnelle (pile à empiler) :**
curiosity gap (hook) → validation d'identité (problème) → appartenance tribale (nous vs eux) → preuve de valeur → aspiration + crédibilité (offre)

**FORMAT :**
- LinkedIn : 3-6 paragraphes courts (1-3 lignes max chacun), jamais de murs de texte, sauts de ligne après chaque idée, CTA final sous forme de question ou micro-engagement
- Twitter/X : 1-3 tweets max, percutant, chaque phrase doit mériter d'être citée seule
- Réponds UNIQUEMENT avec le texte du post. Zéro introduction. Zéro explication.`,
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
