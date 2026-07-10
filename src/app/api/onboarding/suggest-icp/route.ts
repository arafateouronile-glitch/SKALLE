/**
 * POST /api/onboarding/suggest-icp
 *
 * Lit la brandVoice du workspace et demande à Claude de suggérer
 * un profil ICP complet (secteur, titres, douleurs, mots-clés, géographie).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId } = await req.json() as { workspaceId: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { brandVoice: true, domainUrl: true, name: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const bv = ws.brandVoice as Record<string, unknown> | null;
  if (!bv) return NextResponse.json({ error: "Analysez d'abord votre site web (étape 1)" }, { status: 400 });

  const context = [
    ws.name ? `Nom de l'entreprise : ${ws.name}` : "",
    ws.domainUrl ? `Site web : ${ws.domainUrl}` : "",
    bv.offer ? `Offre : ${bv.offer}` : "",
    bv.targetAudience ? `Audience cible déclarée : ${bv.targetAudience}` : "",
    bv.tone ? `Ton : ${bv.tone}` : "",
    bv.industry ? `Secteur détecté : ${bv.industry}` : "",
    bv.productFeatures && Array.isArray(bv.productFeatures)
      ? `Fonctionnalités : ${(bv.productFeatures as string[]).join(", ")}`
      : "",
    bv.valueProposition ? `Proposition de valeur : ${bv.valueProposition}` : "",
  ].filter(Boolean).join("\n");

  const claude = getClaude();
  const response = await claude.invoke([
    new SystemMessage(`Tu es un expert en sales B2B et en définition d'ICP (Ideal Customer Profile).
À partir des informations sur une entreprise, tu génères un profil ICP précis et actionnable.
Réponds UNIQUEMENT avec un JSON valide, sans markdown.`),
    new HumanMessage(`Voici les informations sur l'entreprise :

${context}

Génère un ICP B2B complet et précis. Réponds avec ce JSON exact :
{
  "industry": "secteur principal en français (ex: Logiciels SaaS B2B)",
  "jobTitles": ["titre 1", "titre 2", "titre 3"],
  "companySizes": ["TPE", "PME"],
  "locations": ["France", "Belgique"],
  "keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
  "painPoints": ["douleur 1", "douleur 2", "douleur 3"],
  "messagingAngle": "angle de message principal pour accrocher ce persona"
}`),
  ]);

  const raw = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  try {
    const icp = JSON.parse(cleaned) as Record<string, unknown>;
    return NextResponse.json({ success: true, icp });
  } catch {
    return NextResponse.json({ error: "Parsing ICP échoué", raw }, { status: 500 });
  }
}
