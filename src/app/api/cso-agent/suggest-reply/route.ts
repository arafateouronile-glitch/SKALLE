/**
 * POST /api/cso-agent/suggest-reply
 *
 * Génère une réponse IA contextuelle quand un prospect répond sur LinkedIn.
 * Utilise : replyPreview + profil LinkedIn + brand voice + message original envoyé.
 *
 * Body: { prospectId }
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { buildBrandContext } from "@/lib/prospection/message-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── System prompt (caché — >1024 tokens) ─────────────────────────────────────

const REPLY_SYSTEM = `Tu es un expert en vente B2B et en communication commerciale LinkedIn.

Quand un prospect répond à un premier message, c'est le moment le plus critique de la vente.
Ta mission : générer LA réponse parfaite pour transformer cet échange en rendez-vous.

## ANALYSE DE L'INTENTION (obligatoire avant d'écrire)

Identifie le signal dans la réponse du prospect :

**INTÉRESSÉ / CURIEUX** — Il pose une question, mentionne un problème spécifique, demande des détails
→ Répondre à sa question précisément (une seule chose) + proposer le RDV

**POLI MAIS PAS CHAUD** — Réponse vague ("Intéressant", "Merci"), pas d'engagement réel
→ Relancer avec une douleur spécifique à son profil + CTA faible friction (10 min, pas 1h)

**OBJECTION** — "Pas le moment", "On a déjà quelque chose", "Budget pas disponible"
→ Valider l'objection sans la combattre + planter une graine pour plus tard

**TRÈS CHAUD** — Il mentionne un besoin urgent, parle d'un projet en cours, pose plusieurs questions
→ Proposer le calendly directement, réponse courte et directe

## RÈGLES D'ÉCRITURE

- Commence par reconnaître SPÉCIFIQUEMENT ce qu'il a dit (cite ses mots, pas les tiens)
- Maximum 80 mots — on converse, on ne pitch pas
- Une seule question OU un seul CTA — jamais les deux
- JAMAIS : "Merci pour votre retour", "Je serais ravi de", "N'hésitez pas à"
- Ton adapté à son titre : directeur/fondateur = direct et concret | consultant/prescripteur = mentionner la valeur pour ses clients
- Si un Calendly est disponible et l'intent est "intéressé" ou "très chaud" → l'inclure naturellement
- Signe avec le prénom seulement

Réponds en JSON strict, sans markdown :
{
  "intent": "interested | curious | polite | objection | hot",
  "intentLabel": "description courte de l'intention détectée",
  "suggestedReply": "le message à envoyer",
  "reasoning": "pourquoi cette approche (1 phrase)"
}`;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { prospectId } = (await req.json()) as { prospectId: string };
  if (!prospectId) {
    return NextResponse.json({ error: "prospectId requis" }, { status: 400 });
  }

  // Charger le prospect + workspace en parallèle
  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, brandVoice: true, calendarLink: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId: { in: workspaceIds } },
    select: {
      id: true,
      name: true,
      jobTitle: true,
      company: true,
      workspaceId: true,
      enrichmentData: true,
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }

  const workspace = workspaces.find((w) => w.id === prospect.workspaceId)!;
  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(workspace.name, bv);

  const ed = (prospect.enrichmentData ?? {}) as Record<string, unknown>;
  const li = (ed.linkedIn ?? {}) as Record<string, unknown>;

  // Contexte du prospect
  const replyPreview = (ed.replyPreview as string) ?? null;
  const originalMessage = (ed.pendingMessage as string) ?? null;
  const headline = (li.headline as string) ?? prospect.jobTitle ?? null;
  const about = (li.about as string) ?? null;

  if (!replyPreview) {
    return NextResponse.json({ error: "Aucune réponse à analyser" }, { status: 422 });
  }

  const firstName = prospect.name.split(" ")[0];

  // Construire le contexte features
  const featuresLine = brand.productFeatures?.length
    ? `Fonctionnalités clés à mentionner si pertinent : ${brand.productFeatures.join(" · ")}`
    : "";

  const human = new HumanMessage(`
## PROSPECT
Prénom : ${firstName}
Poste : ${prospect.jobTitle ?? "non précisé"} chez ${prospect.company}
${headline ? `Headline LinkedIn : "${headline}"` : ""}
${about ? `Section "À propos" : "${about.slice(0, 300)}"` : ""}

## CE QU'IL A ÉCRIT (sa réponse)
"${replyPreview}"

## CE QU'ON LUI AVAIT ENVOYÉ (message original)
"${originalMessage ? originalMessage.slice(0, 400) : "Message LinkedIn initial"}"

## NOTRE PRODUIT — ${brand.companyName}
Offre : ${brand.offer}
${featuresLine}
${brand.socialProof ? `Références : ${brand.socialProof}` : ""}
${workspace.calendarLink ? `Lien de réservation : ${workspace.calendarLink}` : ""}
Ton : ${brand.tone}

Génère la réponse optimale pour transformer cette conversation en RDV.
`);

  const claude = getClaude();
  const system = new SystemMessage({
    content: [{ type: "text", text: REPLY_SYSTEM, cache_control: { type: "ephemeral" } }],
  });

  const response = await claude.invoke([system, human]);
  const raw =
    typeof response.content === "string"
      ? response.content
      : ((response.content as Array<{ text?: string }>)[0]?.text ?? "");

  const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      intent: string;
      intentLabel: string;
      suggestedReply: string;
      reasoning: string;
    };
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "Parsing JSON échoué", raw: cleaned }, { status: 500 });
  }
}
