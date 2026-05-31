import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

export type MessageType = "linkedin_connection" | "linkedin_followup" | "email_cold" | "email_followup";

const ResponseSchema = z.object({
  message: z.string().min(20),
  subject: z.string().optional(),
  type: z.enum(["linkedin_connection", "linkedin_followup", "email_cold", "email_followup"]),
  personalizationScore: z.number().int().min(0).max(100),
  personalizationNotes: z.array(z.string()),
});

export type MessageResult = z.infer<typeof ResponseSchema>;

const SYSTEM_PROMPT = `Tu es un expert en prospection B2B personnalisée — spécialiste du cold outreach LinkedIn et email.

## Règle fondamentale

Un message de prospection performant ne parle PAS de la marque qui prospecte. Il parle du prospect.
L'ordre d'importance : 1) Leur situation spécifique 2) Leur problème probable 3) Le lien avec ce que tu offres
Jamais l'inverse.

## Personnalisation obligatoire

Chaque message DOIT intégrer au moins un élément spécifique au prospect :
- Son titre exact (pas son métier générique)
- Son entreprise (taille, secteur, contexte)
- Sa localisation si pertinente
- Son parcours si connu

Un message générique ne peut pas être personnalisé avec un prénom. La personnalisation, c'est quand la personne pense "comment ils savent ça ?"

## Formats par type

**linkedin_connection (≤ 300 caractères)**
- PAS de "Bonjour, je vous contacte pour..."
- Commencer par une observation sur leur travail OU une question pertinente
- Mentionner pourquoi MAINTENANT (contexte ou timing)
- Zéro pitch produit dans la connexion
- Ton : direct, humain, curieux

**linkedin_followup (≤ 300 caractères)**
- Référencer la connexion acceptée ("Merci pour la connexion")
- Valeur légère avant tout CTA
- 1 seule question ou 1 seul CTA max

**email_cold**
- Objet : ≤ 50 caractères, curiosité ou bénéfice précis, pas de majuscules excessives
- Corps : 80-120 mots max
- Structure : observation → insight → proposition → CTA unique
- Ton : professionnel mais humain, premier degré

**email_followup**
- Référencer l'email précédent en 1 phrase
- Apporter quelque chose de nouveau (cas client, stat, question différente)
- 50-80 mots max

## Ce qui est INTERDIT

- "Je me permets de vous contacter..."
- "Je suis tombé sur votre profil et..."
- Pitcher le produit en message de connexion
- Demander un call de 30 minutes en premier message
- Statistiques inventées
- "J'espère que ce message vous trouve bien"

## Score de personnalisation (0-100)

Évalue le message généré sur la personnalisation :
- 80-100 : impossible à envoyer à quelqu'un d'autre sans modification
- 60-79 : adaptations mineures à faire
- 40-59 : générique avec prénom — faible performance attendue
- 0-39 : masse mailing déguisé

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après.`;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prospectId } = await params;
  const body = (await req.json()) as { type: MessageType; context?: string };
  const { type, context } = body;

  if (!type) return NextResponse.json({ error: "Type requis" }, { status: 400 });

  const [prospect, workspace] = await Promise.all([
    prisma.prospect.findFirst({
      where: { id: prospectId, workspace: { userId: session.user.id } },
      select: {
        name: true,
        company: true,
        jobTitle: true,
        email: true,
        linkedInUrl: true,
        location: true,
        industry: true,
        companySize: true,
        aiSummary: true,
        suggestedHook: true,
        temperature: true,
        score: true,
        enrichmentData: true,
        persona: { select: { name: true, raw: true } },
        interactions: {
          select: { type: true, content: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    }),
    prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { name: true, domainUrl: true, brandVoice: true },
    }),
  ]);

  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "social_post");
  if (!creditResult.success) return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const personaRaw = prospect.persona?.raw as Record<string, unknown> | null;
  const recentInteraction = prospect.interactions[0];

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Génère un message de prospection pour ce prospect :

**TYPE DE MESSAGE :** ${type}

**PROSPECT :**
- Nom : ${prospect.name}
- Titre : ${prospect.jobTitle ?? "non défini"}
- Entreprise : ${prospect.company}${prospect.companySize ? ` (${prospect.companySize})` : ""}
- Secteur : ${prospect.industry ?? "non défini"}
- Localisation : ${prospect.location ?? "non définie"}
- Score ICP : ${prospect.score}/100 · ${prospect.temperature}
${prospect.aiSummary ? `- Résumé IA : ${prospect.aiSummary}` : ""}
${prospect.suggestedHook ? `- Hook suggéré : ${prospect.suggestedHook}` : ""}

**MARQUE QUI PROSPECTE :**
- Nom : ${workspace.name}${workspace.domainUrl ? ` (${workspace.domainUrl})` : ""}
- Secteur : ${bv?.niche ?? "non défini"}
- Proposition de valeur : ${bv?.valueProposition ?? "non définie"}
- Ton : ${bv?.tone ?? "direct et expert"}

${personaRaw?.painPoints ? `**PAIN POINTS ICP (persona "${prospect.persona?.name}") :** ${JSON.stringify(personaRaw.painPoints)}` : ""}

${recentInteraction ? `**DERNIÈRE INTERACTION :** ${recentInteraction.type} — "${recentInteraction.content.slice(0, 200)}" (${new Date(recentInteraction.createdAt).toLocaleDateString("fr-FR")})` : ""}

${context ? `**CONTEXTE ADDITIONNEL :** ${context}` : ""}

Génère le message en JSON :
{
  "type": "${type}",
  "subject": "objet email si applicable, sinon omettre",
  "message": "le message complet",
  "personalizationScore": <0-100>,
  "personalizationNotes": ["élément personnalisé utilisé 1", "élément personnalisé utilisé 2"]
}

Rappel : aucune stat inventée. Aucun pitch en premier message de connexion. Max ${type.includes("linkedin") ? "300 caractères" : "120 mots"}.
JSON valide uniquement.`),
  ]);

  const raw = Array.isArray(response.content)
    ? response.content.map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? "")).join("")
    : String(response.content);

  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let parsed: MessageResult;
  try {
    parsed = ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Erreur de génération — réessayez" }, { status: 500 });
  }

  // Save as AI note
  await prisma.prospectAiNote.create({
    data: {
      prospectId,
      content: parsed.message,
      type: `GENERATED_${type.toUpperCase()}`,
    },
  }).catch(() => null);

  return NextResponse.json(parsed);
}
