import { NextRequest, NextResponse } from "next/server";
import { importProspectsCSV } from "@/actions/csv-import-export";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, csvContent, listId } = await req.json();

    if (!workspaceId || !csvContent) {
      return NextResponse.json({ success: false, error: "Paramètres manquants" }, { status: 400 });
    }

    const result = await importProspectsCSV(workspaceId, csvContent, listId ?? undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
