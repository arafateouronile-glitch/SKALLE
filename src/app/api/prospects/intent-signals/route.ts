/**
 * GET  /api/prospects/intent-signals?workspaceId=xxx
 *   → Liste les signaux détectés pour le workspace (triés par score desc, 50 max)
 *
 * POST /api/prospects/intent-signals  { workspaceId }
 *   → Scanne les entreprises des prospects du workspace et persiste les nouveaux signaux
 *   → Retourne { saved, signals }
 *
 * DELETE /api/prospects/intent-signals?workspaceId=xxx
 *   → Efface tous les signaux du workspace (reset avant nouveau scan)
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scanWorkspaceSignals } from "@/lib/services/prospects/intent-scanner";

async function resolveWorkspace(workspaceId: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await resolveWorkspace(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const signals = await prisma.intentSignal.findMany({
    where: { workspaceId },
    orderBy: [{ score: "desc" }, { detectedAt: "desc" }],
    take: 100,
    include: {
      prospect: { select: { id: true, name: true, company: true, linkedInUrl: true } },
    },
  });

  return NextResponse.json({ signals });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { workspaceId } = (await req.json()) as { workspaceId: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await resolveWorkspace(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  if (!process.env.SERPER_API_KEY) {
    return NextResponse.json({ error: "SERPER_API_KEY manquant" }, { status: 503 });
  }

  // Get unique companies from prospects
  const prospects = await prisma.prospect.findMany({
    where: { workspaceId },
    select: { id: true, company: true },
  });

  const seen = new Set<string>();
  const companies: Array<{ name: string; prospectId: string }> = [];
  for (const p of prospects) {
    const key = p.company.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      companies.push({ name: p.company.trim(), prospectId: p.id });
    }
  }

  if (companies.length === 0) {
    return NextResponse.json({ saved: 0, signals: [], message: "Aucun prospect trouvé" });
  }

  const detected = await scanWorkspaceSignals(companies);

  // Persist — skip duplicates (same company + type + title in last 7 days)
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  let saved = 0;

  for (const sig of detected) {
    const exists = await prisma.intentSignal.findFirst({
      where: {
        workspaceId,
        companyName: sig.companyName,
        type: sig.type,
        title: sig.title,
        detectedAt: { gte: cutoff },
      },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.intentSignal.create({
      data: {
        type: sig.type,
        companyName: sig.companyName,
        title: sig.title,
        description: sig.description,
        sourceUrl: sig.sourceUrl,
        score: sig.score,
        prospectId: sig.prospectId ?? null,
        workspaceId,
      },
    });
    saved++;
  }

  const signals = await prisma.intentSignal.findMany({
    where: { workspaceId },
    orderBy: [{ score: "desc" }, { detectedAt: "desc" }],
    take: 100,
    include: {
      prospect: { select: { id: true, name: true, company: true, linkedInUrl: true } },
    },
  });

  return NextResponse.json({ saved, signals });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await resolveWorkspace(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const { count } = await prisma.intentSignal.deleteMany({ where: { workspaceId } });
  return NextResponse.json({ deleted: count });
}
