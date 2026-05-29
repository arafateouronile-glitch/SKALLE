import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PersonaSuggestion, SuggestionType } from "@/inngest/functions/persona-learning";

export const dynamic = "force-dynamic";

type RawPersona = {
  industry?: string;
  jobTitles?: string[];
  companySizes?: string[];
  locations?: string[];
  keywords?: string[];
  painPoints?: string[];
};

function applyToRaw(raw: RawPersona, type: SuggestionType, value: string): RawPersona {
  const updated = { ...raw };
  switch (type) {
    case "add_job_title":
      updated.jobTitles = [...new Set([...(raw.jobTitles ?? []), value])];
      break;
    case "remove_job_title":
      updated.jobTitles = (raw.jobTitles ?? []).filter((t) => t !== value);
      break;
    case "add_keyword":
      updated.keywords = [...new Set([...(raw.keywords ?? []), value])];
      break;
    case "remove_keyword":
      updated.keywords = (raw.keywords ?? []).filter((k) => k !== value);
      break;
    case "add_location":
      updated.locations = [...new Set([...(raw.locations ?? []), value])];
      break;
    case "add_pain_point":
      updated.painPoints = [...new Set([...(raw.painPoints ?? []), value])];
      break;
  }
  return updated;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    suggestionId: string;
    action: "approve" | "reject";
  };

  const { suggestionId, action } = body;
  if (!suggestionId || !action) {
    return NextResponse.json({ error: "suggestionId et action requis" }, { status: 400 });
  }

  // Vérifier accès
  const persona = await prisma.persona.findFirst({
    where: {
      id: params.id,
      workspace: { userId: session.user.id },
    },
    select: { id: true, raw: true, enhanced: true },
  });

  if (!persona) return NextResponse.json({ error: "Persona introuvable" }, { status: 404 });

  const enhanced = (persona.enhanced ?? {}) as Record<string, unknown>;
  const suggestions = (enhanced.suggestions as PersonaSuggestion[] | undefined) ?? [];

  const suggestion = suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return NextResponse.json({ error: "Suggestion introuvable" }, { status: 404 });

  // Mettre à jour le statut de la suggestion
  const updatedSuggestions = suggestions.map((s) =>
    s.id === suggestionId ? { ...s, status: action === "approve" ? "approved" : "rejected" } : s
  );

  let updatedRaw = persona.raw as RawPersona;

  // Si approuvée : appliquer la modification au persona.raw
  if (action === "approve") {
    updatedRaw = applyToRaw(updatedRaw, suggestion.type, suggestion.value);
  }

  await prisma.persona.update({
    where: { id: params.id },
    data: {
      raw: updatedRaw,
      enhanced: {
        ...(enhanced as object),
        suggestions: updatedSuggestions,
      },
    },
  });

  return NextResponse.json({ ok: true, applied: action === "approve" });
}
