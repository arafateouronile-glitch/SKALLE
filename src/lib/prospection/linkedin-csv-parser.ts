import Papa from "papaparse";

export type LinkedInFormat = "basic" | "sales_nav" | "recruiter" | "mapped" | "unknown";

export interface ParsedLinkedInLead {
  name: string;
  email?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  linkedInUrl?: string;
  industry?: string;
  /** SIREN (identifiant entreprise français, 9 chiffres) — stocké ensuite dans
   * `Prospect.enrichmentData.siren`, utilisé par `decision-maker-resolver.ts`
   * pour un lookup INSEE direct (gratuit, plus fiable que la recherche LinkedIn). */
  siren?: string;
}

export interface LinkedInParseResult {
  format: LinkedInFormat;
  leads: ParsedLinkedInLead[];
  errors: string[];
  totalRows: number;
  /** En-têtes réelles détectées — nécessaire pour l'écran de mapping manuel
   * quand aucun format LinkedIn connu n'est reconnu. */
  headers: string[];
  /** Lignes brutes — réutilisées par `mapRowsToLeads` une fois le mapping choisi. */
  rows: Record<string, string>[];
}

export interface ColumnMapping {
  name: string;
  /** Colonne optionnelle à concaténer après `name` — cas prénom/nom séparés en 2 colonnes. */
  nameSecondary?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  linkedInUrl?: string;
  industry?: string;
  siren?: string;
}

// LinkedIn Basic (Connections export)
// Headers: First Name, Last Name, URL, Email Address, Company, Position, Connected On
// Note: LinkedIn CSV exports have 2-3 header lines to skip (cf. parseLinkedInCSV)
function parseBasicFormat(rows: Record<string, string>[]): ParsedLinkedInLead[] {
  return rows
    .map((row): ParsedLinkedInLead | null => {
      const firstName = row["First Name"]?.trim() || "";
      const lastName = row["Last Name"]?.trim() || "";
      const name = `${firstName} ${lastName}`.trim();

      if (!name) return null;

      return {
        name,
        email: row["Email Address"]?.trim() || undefined,
        company: row["Company"]?.trim() || "",
        jobTitle: row["Position"]?.trim() || undefined,
        linkedInUrl: row["URL"]?.trim() || undefined,
      };
    })
    .filter((l): l is ParsedLinkedInLead => l !== null);
}

// Sales Navigator (Lead List export)
// Headers: First Name, Last Name, Title, Company, Company Size, Location, LinkedIn URL
function parseSalesNavFormat(rows: Record<string, string>[]): ParsedLinkedInLead[] {
  return rows
    .map((row): ParsedLinkedInLead | null => {
      const firstName =
        row["First Name"]?.trim() || row["Prénom"]?.trim() || "";
      const lastName =
        row["Last Name"]?.trim() || row["Nom"]?.trim() || "";
      const name = `${firstName} ${lastName}`.trim();

      if (!name) return null;

      return {
        name,
        email: row["Email"]?.trim() || undefined,
        company:
          row["Company"]?.trim() || row["Entreprise"]?.trim() || "N/A",
        jobTitle: row["Title"]?.trim() || row["Titre"]?.trim() || undefined,
        location:
          row["Location"]?.trim() ||
          row["Geography"]?.trim() ||
          row["Localisation"]?.trim() ||
          undefined,
        linkedInUrl:
          row["LinkedIn URL"]?.trim() ||
          row["Profile URL"]?.trim() ||
          row["Lead URL"]?.trim() ||
          row["LinkedIn Member Profile URL"]?.trim() ||
          undefined,
        industry:
          row["Industry"]?.trim() || row["Industrie"]?.trim() || undefined,
      };
    })
    .filter((l): l is ParsedLinkedInLead => l !== null);
}

// Recruiter Lite export
// Headers: Name, Current Title, Current Company, Location, Profile URL
function parseRecruiterFormat(rows: Record<string, string>[]): ParsedLinkedInLead[] {
  return rows
    .map((row): ParsedLinkedInLead | null => {
      const name =
        row["Name"]?.trim() ||
        row["Full Name"]?.trim() ||
        row["Nom"]?.trim() ||
        "";

      if (!name) return null;

      return {
        name,
        email: row["Email"]?.trim() || undefined,
        company:
          row["Current Company"]?.trim() ||
          row["Company"]?.trim() ||
          "N/A",
        jobTitle:
          row["Current Title"]?.trim() ||
          row["Title"]?.trim() ||
          undefined,
        location: row["Location"]?.trim() || undefined,
        linkedInUrl:
          row["Profile URL"]?.trim() ||
          row["LinkedIn URL"]?.trim() ||
          row["Public Profile URL"]?.trim() ||
          undefined,
      };
    })
    .filter((l): l is ParsedLinkedInLead => l !== null);
}

/**
 * Applique un mapping de colonnes choisi manuellement par l'utilisateur —
 * chemin utilisé quand le fichier n'est pas un export LinkedIn reconnu (CRM,
 * Excel, Google Sheets...). `name` est la seule clé requise ; les autres
 * champs restent vides si non mappés plutôt que de rejeter la ligne.
 */
export function mapRowsToLeads(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): ParsedLinkedInLead[] {
  return rows
    .map((row): ParsedLinkedInLead | null => {
      const primary = mapping.name ? row[mapping.name]?.trim() || "" : "";
      const secondary = mapping.nameSecondary ? row[mapping.nameSecondary]?.trim() || "" : "";
      const name = `${primary} ${secondary}`.trim();

      if (!name) return null;

      return {
        name,
        email: mapping.email ? row[mapping.email]?.trim() || undefined : undefined,
        company: mapping.company ? row[mapping.company]?.trim() || "" : "",
        jobTitle: mapping.jobTitle ? row[mapping.jobTitle]?.trim() || undefined : undefined,
        location: mapping.location ? row[mapping.location]?.trim() || undefined : undefined,
        linkedInUrl: mapping.linkedInUrl ? row[mapping.linkedInUrl]?.trim() || undefined : undefined,
        industry: mapping.industry ? row[mapping.industry]?.trim() || undefined : undefined,
        // Les exports FR formattent souvent le SIREN avec des espaces ("552 100 554")
        // — on les retire pour matcher le format stocké par Qualiopi Radar.
        siren: mapping.siren ? row[mapping.siren]?.replace(/\s/g, "").trim() || undefined : undefined,
      };
    })
    .filter((l): l is ParsedLinkedInLead => l !== null);
}

// Auto-detecter le format LinkedIn par les headers
function detectFormat(headers: string[]): LinkedInFormat {
  const h = new Set(headers.map((x) => x.toLowerCase().trim()));

  // Sales Navigator: a "linkedin url" ou "linkedin member profile url"
  if (
    h.has("linkedin url") ||
    h.has("linkedin member profile url") ||
    (h.has("first name") && h.has("company") && (h.has("title") || h.has("geography")))
  ) {
    return "sales_nav";
  }

  // Recruiter Lite: a "current title" et "current company"
  if (h.has("current title") || h.has("current company")) {
    return "recruiter";
  }

  // LinkedIn Basic: a "first name", "last name", "email address", "connected on"
  if (h.has("first name") && h.has("last name") && (h.has("email address") || h.has("connected on"))) {
    return "basic";
  }

  // Recruiter fallback: a "name" et "profile url"
  if ((h.has("name") || h.has("full name")) && h.has("profile url")) {
    return "recruiter";
  }

  return "unknown";
}

// En-têtes connues des exports LinkedIn — déclenche la recherche de la vraie
// ligne d'en-têtes uniquement après avoir vu un marqueur "Notes:" (préambule
// LinkedIn Basic), jamais sur un CSV générique qui n'a pas ce marqueur.
const KNOWN_HEADER_TOKENS = ["first name", "last name", "name", "full name", "current company", "company"];

function looksLikeHeaderRow(line: string): boolean {
  const cols = line.split(",").map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ""));
  return KNOWN_HEADER_TOKENS.some((tok) => cols.includes(tok));
}

/**
 * Parse un fichier CSV LinkedIn (Basic, Sales Navigator, ou Recruiter Lite)
 * ou un CSV générique (via mapping manuel ensuite). Auto-detection du format
 * LinkedIn ; sinon retourne les en-têtes/lignes brutes pour permettre un
 * mapping manuel côté UI.
 */
export function parseLinkedInCSV(content: string): LinkedInParseResult {
  const errors: string[] = [];

  // Strip BOM — gotcha fréquent si le fichier a été réouvert/resauvegardé
  // dans Excel/Numbers avant l'import (casse sinon le nom de la 1ère colonne).
  let cleanContent = content.replace(/^﻿/, "");

  // LinkedIn Basic (Connections.csv) démarre par "Notes:" suivi d'une phrase
  // d'avertissement qui contient elle-même des virgules — ne pas se baser sur
  // "contient une virgule" pour deviner la fin du préambule (ça attrape la
  // phrase d'avertissement, pas les vraies en-têtes). On ne déclenche cette
  // recherche que si on voit le marqueur "Notes:" explicite, spécifique à
  // LinkedIn — un CSV générique (CRM, Excel...) n'est jamais touché par ça.
  const lines = cleanContent.split("\n");
  const notesIdx = lines.findIndex((l) => l.trim().startsWith("Notes:"));
  if (notesIdx !== -1) {
    const headerIdx = lines.findIndex((l, i) => i > notesIdx && looksLikeHeaderRow(l));
    if (headerIdx > notesIdx) {
      cleanContent = lines.slice(headerIdx).join("\n");
    }
  }

  const parsed = Papa.parse(cleanContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    errors.push(
      ...parsed.errors.slice(0, 5).map((e) => `Ligne ${e.row}: ${e.message}`)
    );
  }

  const headers = parsed.meta.fields || [];
  const format = detectFormat(headers);
  const rows = parsed.data as Record<string, string>[];

  let leads: ParsedLinkedInLead[] = [];

  switch (format) {
    case "basic":
      leads = parseBasicFormat(rows);
      break;
    case "sales_nav":
      leads = parseSalesNavFormat(rows);
      break;
    case "recruiter":
      leads = parseRecruiterFormat(rows);
      break;
    case "unknown":
    default:
      errors.push(
        "Format non reconnu. Headers detectes: " + headers.slice(0, 5).join(", ")
      );
      // Tentative générique best-effort (intitulés anglais/français courants)
      // — avant de proposer le mapping manuel côté UI si ça ne suffit pas.
      leads = rows
        .map((row): ParsedLinkedInLead | null => {
          const name =
            row["Name"] ||
            row["Nom"] ||
            `${row["First Name"] || ""} ${row["Last Name"] || ""}`.trim();

          if (!name) return null;

          return {
            name,
            email: row["Email"] || row["Email Address"] || undefined,
            company:
              row["Company"] || row["Entreprise"] || row["Current Company"] || "",
            jobTitle:
              row["Title"] || row["Position"] || row["Current Title"] || undefined,
            location: row["Location"] || undefined,
            linkedInUrl:
              row["LinkedIn URL"] || row["Profile URL"] || undefined,
            siren: (row["SIREN"] || row["Siren"] || row["N° SIREN"])?.replace(/\s/g, "") || undefined,
          };
        })
        .filter((l): l is ParsedLinkedInLead => l !== null);
      break;
  }

  return {
    format,
    leads,
    errors,
    totalRows: rows.length,
    headers,
    rows,
  };
}
