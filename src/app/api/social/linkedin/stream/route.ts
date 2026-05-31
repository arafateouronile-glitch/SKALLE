import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { NextResponse } from "next/server";
import type { LinkedInTrigger, LinkedInFormat } from "@/app/api/social/linkedin/generate/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const META_SEP = "\n---META---\n";

const TRIGGER_LABELS: Record<LinkedInTrigger, string> = {
  curiosity_gap:
    "Curiosity gap — tension entre ce que le lecteur sait et ce qu'il VEUT savoir. Chiffres précis + savoir exclusif + inattendu",
  identity_validation:
    "Validation d'identité — articule ce que la cible ressent mais n'a jamais dit. Quand ils se sentent 'vus', ils commentent par réflexe",
  tribal_belonging:
    "Appartenance tribale — in-group / out-group clair. Personne ne veut être du mauvais côté",
  productive_discomfort:
    "Inconfort productif — challenge une croyance forte, mais avec une voie de sortie concrète. L'inconfort sans sortie repousse",
  aspiration:
    "Aspiration — l'outcome doit sembler ambitieux MAIS atteignable. Impressionnant sans être irréel pour la cible",
  status_signal:
    "Signal de statut — le lecteur partage ce qui le fait paraître bien. Question : qu'est-ce que partager CE post dit sur lui ?",
};

const FORMAT_INSTRUCTIONS: Record<LinkedInFormat, string> = {
  post_court: `Post court — 150-220 mots. Structure : hook (1 ligne) → 3-4 paragraphes de 1-2 lignes → CTA (1 ligne).`,
  storytelling: `Storytelling — commence IN MEDIAS RES. Scène d'ouverture → tension croissante → bascule inattendue → leçon non-évidente → question invitant à partager UNE expérience.`,
  listicle: `Listicle — 4-6 points MAX. Hook = affirmation provocatrice. Chaque point = titre fort + explication concrète (1 ligne). Dernier point le plus contre-intuitif.`,
  how_to: `How-to — 3-5 étapes actionnables. Résultat précis en hook. Chaque étape = verbe d'action concret. UNE étape contre-intuitive obligatoire.`,
  contrarian: `Opinion contrariante — sans hésitation, sans "je pense que". Progression logique → opinion évidente rétrospectivement. Nuance obligatoire. CTA qui invite au désaccord.`,
};

// ─── System prompt (static — prompt caching) ─────────────────────────────────

const SYSTEM_PROMPT = `Tu es un ghostwriter LinkedIn de niveau mondial. Tu écris pour des fondateurs, directeurs, et experts B2B qui veulent que leurs posts sonnent exactement comme eux — pas comme un outil IA.

## RÈGLE ZÉRO — SOURCING IMPÉRATIF

Tout chiffre, toute stat, toute affirmation factuelle DOIT être sourcée inline ou remplacée par :
- Une observation personnelle directe : "Sur les 23 deals que j'ai closé..."
- Une anecdote précise sans chiffre inventé
- Une formulation qualitative honnête : "La quasi-totalité des CMOs que je rencontre..."
JAMAIS inventer un pourcentage. JAMAIS "selon des experts" sans source.

## Les 12 "tells" IA INTERDITS

1. "Il est important de noter que..."
2. "Dans un monde où [trend générique]..."
3. "En tant que [titre professionnel], j'ai appris que..."
4. "La clé du succès réside dans..."
5. Trois adjectifs en liste : "dynamique, innovante et orientée résultats"
6. "Qu'en pensez-vous ?" comme seul CTA
7. "J'espère que cela vous aide / inspire"
8. Commencer par une définition
9. "Cela dit, il faut nuancer / relativiser..."
10. Listes parfaitement symétriques avec emojis identiques
11. "C'est pourquoi il est essentiel de..."
12. "N'hésitez pas à me contacter"

## Règles de qualité

- Spécificité > généralité. Chaque affirmation floue = occasion manquée.
- Paragraphes 1-2 lignes MAX, ligne blanche entre chaque
- 150-280 mots pour le reach optimal
- Hook dans les 210 premiers caractères
- 3 hashtags MAX ultra-spécifiques en toute fin
- Zéro lien dans le post (dans le premier commentaire)
- CTA = question ultra-spécifique OU invitation à partager UNE expérience précise
- Test "vieux copain" : est-ce que quelqu'un enverrait ce post à un ami ?

## FORMAT DE SORTIE (non négociable)

Tu dois écrire dans cet ordre exact :
1. Le texte du post LinkedIn directement (pas de JSON, pas de guillemets, pas de délimiteurs)
2. Exactement sur une nouvelle ligne : ---META---
3. Un JSON valide avec les clés "hooks" (array de 3 strings) et "firstComment" (string)

Exemple :
J'ai failli fermer l'entreprise à cause d'une virgule.

Pas une exagération. Un contrat mal rédigé, une clause ambiguë, et trois semaines de litige qui ont failli tout emporter.

[... suite du post ...]

#B2B #Entrepreneuriat #Legal

---META---
{"hooks":["hook 1","hook 2","hook 3"],"firstComment":"💡 Pour aller plus loin..."}

NE COMMENCE PAS par du JSON. Le post vient EN PREMIER, brut, directement.`;

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    trigger: LinkedInTrigger;
    subject: string;
    format: LinkedInFormat;
  };
  const { trigger, subject, format } = body;

  if (!trigger || !subject?.trim() || !format)
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, domainUrl: true, brandVoice: true },
  });
  if (!workspace)
    return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "post_direct_generate");
  if (!creditResult.success)
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const linkedInVoice = bv?.linkedInVoice as Record<string, unknown> | null;

  const voiceInstruction = linkedInVoice
    ? `\n**PROFIL DE VOIX (à imiter fidèlement) :**
- Style : ${linkedInVoice.writingStyleDescription ?? ""}
- Ton : ${linkedInVoice.tone ?? ""}
- Mots signature : ${Array.isArray(linkedInVoice.signatureWords) ? (linkedInVoice.signatureWords as string[]).join(", ") : ""}
- CTA habituel : ${linkedInVoice.ctaStyle ?? ""}
INSTRUCTION : le post doit sonner exactement comme cette voix.`
    : "";

  const model = getClaude();

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      let fullBuffer = "";
      let postStreamed = false; // true once we found ---META---

      try {
        const stream = await model.stream([
          new SystemMessage({ content: SYSTEM_PROMPT }),
          new HumanMessage(`Génère un post LinkedIn ultra-optimisé.

**DÉCLENCHEUR ÉMOTIONNEL :** ${TRIGGER_LABELS[trigger]}
**FORMAT :** ${FORMAT_INSTRUCTIONS[format]}
**SUJET / ANGLE :** ${subject.trim()}

**CONTEXTE MARQUE :**
- Marque : ${workspace.name}${workspace.domainUrl ? ` (${workspace.domainUrl})` : ""}
- Niche : ${bv?.niche ?? "non définie"}
- Ton : ${bv?.tone ?? "direct et expert"}
- Piliers contenu : ${Array.isArray(bv?.contentPillars) ? (bv.contentPillars as string[]).join(", ") : "non définis"}
- Persona cible : ${bv?.targetPersona ?? "non défini"}
${voiceInstruction}

**Hooks — 3 premières lignes ALTERNATIVES dans le JSON "hooks" :**
- Hook 1 : contre-vérité sans hésitation
- Hook 2 : confession courte (max 12 mots)
- Hook 3 : pattern interrupt avec observation directe

**firstComment :** mini-hook + insight bonus + question de relance. 40-80 mots.

Rappel format de sortie : post brut en premier, puis ---META--- sur sa propre ligne, puis JSON {"hooks":[...],"firstComment":"..."}.`),
        ]);

        for await (const chunk of stream) {
          const text =
            typeof chunk.content === "string"
              ? chunk.content
              : Array.isArray(chunk.content)
                ? chunk.content
                    .map((b: string | { type: string; text?: string }) =>
                      typeof b === "string" ? b : (b.text ?? "")
                    )
                    .join("")
                : "";

          if (!text) continue;
          fullBuffer += text;

          // If we haven't found the separator yet, stream post tokens
          if (!postStreamed) {
            const sepIdx = fullBuffer.indexOf(META_SEP);
            if (sepIdx === -1) {
              // Separator not yet seen — stream everything except a safety tail
              // (to avoid accidentally streaming part of "---META---")
              const safeLen = Math.max(0, fullBuffer.length - 15);
              if (safeLen > 0) {
                const toSend = fullBuffer.slice(0, safeLen);
                controller.enqueue(
                  encoder.encode(sse("token", { text: toSend }))
                );
                fullBuffer = fullBuffer.slice(safeLen);
              }
            } else {
              // Found the separator — send the remaining post content
              const postContent = fullBuffer.slice(0, sepIdx);
              if (postContent) {
                controller.enqueue(
                  encoder.encode(sse("token", { text: postContent }))
                );
              }
              controller.enqueue(encoder.encode(sse("post_done", {})));
              postStreamed = true;
              fullBuffer = fullBuffer.slice(sepIdx + META_SEP.length);
            }
          }
          // After separator found, keep accumulating meta JSON silently
        }

        // Stream ended — parse meta from whatever remains in fullBuffer
        // fullBuffer contains everything after ---META---
        const metaRaw = fullBuffer
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();

        let meta: { hooks: string[]; firstComment: string } | null = null;
        try {
          meta = JSON.parse(metaRaw) as { hooks: string[]; firstComment: string };
        } catch {
          // Try to extract JSON block if there's trailing text
          const jsonMatch = metaRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              meta = JSON.parse(jsonMatch[0]) as {
                hooks: string[];
                firstComment: string;
              };
            } catch {
              /* give up */
            }
          }
        }

        if (meta?.hooks && meta.firstComment) {
          controller.enqueue(encoder.encode(sse("meta", meta)));
        }

        controller.enqueue(encoder.encode(sse("done", {})));
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sse("error", {
              message: err instanceof Error ? err.message : "Erreur de génération",
            })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
