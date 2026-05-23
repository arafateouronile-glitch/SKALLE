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
        content: `Tu es un expert en copywriting viral pour les réseaux sociaux.
Tu dois réécrire un post viral en l'adaptant à la marque de l'utilisateur.
Garde la même structure et le même type de hook, mais change le contenu pour parler de la marque.
Réponds UNIQUEMENT avec le texte du post, sans introduction ni explication.`,
      }),
      new HumanMessage(`Post viral original (${brief.platform}) — score ${brief.viralScore} :
"${brief.originalContent.slice(0, 800)}"

Type de hook détecté : ${brief.hookType}
Structure : ${brief.structure}

Marque : ${workspace.name} (${workspace.domainUrl})
Niche : ${bv?.niche ?? "non définie"}
Ton : ${bv?.tone ?? "professionnel"}
Piliers de contenu : ${Array.isArray(bv?.contentPillars) ? (bv.contentPillars as string[]).join(", ") : "non définis"}

Réécris ce post pour ${workspace.name} en gardant le même impact viral.
Adapte la plateforme : ${brief.platform === "TWITTER" ? "280 caractères max, ton percutant" : "style LinkedIn, 3-5 paragraphes courts"}.`),
    ]);

  return NextResponse.json({
    generatedPost,
    brief,
    workspaceId: workspace.id,
  });
}
