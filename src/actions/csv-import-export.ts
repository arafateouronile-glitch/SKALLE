"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";
import { importLeads } from "./leads";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorise");
  }
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════

export async function exportProspectsCSV(
  workspaceId: string,
  listId?: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    const session = await requireAuth();

    const where: any = {
      workspaceId,
      workspace: { userId: session.user!.id! },
    };

    if (listId) {
      where.lists = { some: { prospectListId: listId } };
    }

    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const csvData = prospects.map((p) => ({
      Nom: p.name,
      Email: p.email || "",
      Telephone: p.phone || "",
      LinkedIn: p.linkedInUrl || "",
      Entreprise: p.company,
      Poste: p.jobTitle || "",
      Localisation: p.location || "",
      Industrie: p.industry || "",
      Statut: p.status,
    }));

    const csv = Papa.unparse(csvData);

    return { success: true, csv };
  } catch (error) {
    console.error("Export CSV error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT CSV
// ═══════════════════════════════════════════════════════════════════════════

// Mapping des colonnes CSV vers les champs internes
const COLUMN_MAPPINGS: Record<string, string> = {
  // Francais
  nom: "name",
  prenom: "name",
  email: "email",
  "e-mail": "email",
  telephone: "phone",
  tel: "phone",
  entreprise: "company",
  societe: "company",
  poste: "jobTitle",
  titre: "jobTitle",
  fonction: "jobTitle",
  localisation: "location",
  ville: "location",
  industrie: "industry",
  secteur: "industry",
  linkedin: "linkedInUrl",
  "url linkedin": "linkedInUrl",
  // Anglais
  name: "name",
  "first name": "name",
  "last name": "lastName",
  "full name": "name",
  phone: "phone",
  company: "company",
  "job title": "jobTitle",
  title: "jobTitle",
  position: "jobTitle",
  location: "location",
  city: "location",
  industry: "industry",
  "linkedin url": "linkedInUrl",
  "linkedin profile": "linkedInUrl",
  "profile url": "linkedInUrl",
};

function mapColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  return COLUMN_MAPPINGS[normalized] || null;
}

export async function importProspectsCSV(
  workspaceId: string,
  csvContent: string,
  listId?: string
): Promise<{
  success: boolean;
  imported?: number;
  duplicates?: number;
  errors?: number;
  error?: string;
}> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouve" };
    }

    // Parser le CSV
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return { success: false, error: "Fichier CSV invalide" };
    }

    // Auto-detecter le mapping des colonnes
    const headers = parsed.meta.fields || [];
    const columnMap: Record<string, string> = {};

    for (const header of headers) {
      const mapped = mapColumn(header);
      if (mapped) {
        columnMap[header] = mapped;
      }
    }

    // Convertir les lignes en leads
    const leads: Array<{
      name: string;
      email?: string;
      phone?: string;
      linkedInUrl?: string;
      company: string;
      jobTitle?: string;
      location?: string;
      industry?: string;
    }> = [];

    for (const row of parsed.data as Record<string, string>[]) {
      const lead: any = {};
      let hasFirstName = false;
      let lastName = "";

      for (const [csvHeader, fieldName] of Object.entries(columnMap)) {
        const value = row[csvHeader]?.trim();
        if (!value) continue;

        if (fieldName === "lastName") {
          lastName = value;
          continue;
        }

        if (fieldName === "name" && csvHeader.toLowerCase().includes("first")) {
          hasFirstName = true;
        }

        lead[fieldName] = value;
      }

      // Combiner first name + last name si necessaire
      if (hasFirstName && lastName) {
        lead.name = `${lead.name} ${lastName}`.trim();
      }

      // Valider les champs obligatoires
      if (!lead.name || !lead.company) {
        continue; // Skip les lignes sans nom ou entreprise
      }

      leads.push(lead);
    }

    if (leads.length === 0) {
      return { success: false, error: "Aucun prospect valide dans le CSV" };
    }

    // Importer via la fonction existante
    const result = await importLeads(workspaceId, leads, listId);

    return {
      success: result.success,
      imported: result.imported,
      duplicates: result.duplicates,
      errors: result.errors,
      error: result.error,
    };
  } catch (error) {
    console.error("Import CSV error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW CSV (pour le dialog)
// ═══════════════════════════════════════════════════════════════════════════

export async function previewCSV(
  csvContent: string
): Promise<{
  success: boolean;
  headers?: string[];
  mappings?: Record<string, string | null>;
  preview?: Record<string, string>[];
  totalRows?: number;
  error?: string;
}> {
  try {
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      preview: 5,
      transformHeader: (h: string) => h.trim(),
    });

    const headers = parsed.meta.fields || [];
    const mappings: Record<string, string | null> = {};

    for (const header of headers) {
      mappings[header] = mapColumn(header);
    }

    // Compter le total de lignes (re-parse sans preview)
    const fullParse = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    return {
      success: true,
      headers,
      mappings,
      preview: parsed.data as Record<string, string>[],
      totalRows: fullParse.data.length,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
