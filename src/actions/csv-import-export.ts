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
  "nom complet": "name",
  prenom: "firstName",
  "prénom": "firstName",
  "nom de famille": "lastName",
  email: "email",
  "e-mail": "email",
  "adresse email": "email",
  "adresse e-mail": "email",
  telephone: "phone",
  "téléphone": "phone",
  tel: "phone",
  portable: "phone",
  entreprise: "company",
  "société": "company",
  societe: "company",
  organisation: "company",
  poste: "jobTitle",
  titre: "jobTitle",
  fonction: "jobTitle",
  "intitulé du poste": "jobTitle",
  localisation: "location",
  ville: "location",
  pays: "location",
  région: "location",
  industrie: "industry",
  secteur: "industry",
  domaine: "industry",
  linkedin: "linkedInUrl",
  "url linkedin": "linkedInUrl",
  "lien linkedin": "linkedInUrl",
  // Anglais
  name: "name",
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  surname: "lastName",
  "full name": "name",
  fullname: "name",
  phone: "phone",
  mobile: "phone",
  "work direct phone": "phone",
  "mobile phone": "phone",
  "corporate phone": "phone",
  "home phone": "phone",
  company: "company",
  "company name": "company",
  "company name for emails": "company",
  organization: "company",
  employer: "company",
  "job title": "jobTitle",
  title: "jobTitle",
  position: "jobTitle",
  role: "jobTitle",
  seniority: "jobTitle",
  location: "location",
  city: "locationCity",
  state: "locationState",
  country: "locationCountry",
  industry: "industry",
  "linkedin url": "linkedInUrl",
  "linkedin profile": "linkedInUrl",
  "profile url": "linkedInUrl",
  "linkedin member profile url": "linkedInUrl",
  "person linkedin url": "linkedInUrl",
  url: "linkedInUrl",
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
      let firstName = "";
      let lastName = "";
      let locationCity = "";
      let locationState = "";
      let locationCountry = "";

      for (const [csvHeader, fieldName] of Object.entries(columnMap)) {
        const value = row[csvHeader]?.trim();
        if (!value) continue;

        if (fieldName === "firstName") { firstName = value; continue; }
        if (fieldName === "lastName") { lastName = value; continue; }
        if (fieldName === "locationCity") { locationCity = value; continue; }
        if (fieldName === "locationState") { locationState = value; continue; }
        if (fieldName === "locationCountry") { locationCountry = value; continue; }

        lead[fieldName] = value;
      }

      // Combiner first name + last name si necessaire
      if (firstName || lastName) {
        lead.name = `${firstName} ${lastName}`.trim() || lead.name;
      }

      // Combiner city / state / country en une seule localisation
      if (locationCity || locationState || locationCountry) {
        const parts = [locationCity, locationState, locationCountry].filter(Boolean);
        lead.location = parts.join(", ");
      }

      // Valider le nom minimum
      if (!lead.name) continue;

      // company requis par le schema — on met "" si absent plutot que de skipper
      if (!lead.company) lead.company = "";

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

    const LOCATION_PARTS = new Set(["locationCity", "locationState", "locationCountry"]);
    for (const header of headers) {
      const mapped = mapColumn(header);
      mappings[header] = mapped && LOCATION_PARTS.has(mapped) ? "location" : mapped;
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
