import Papa from "papaparse";

export type LinkedInFormat = "basic" | "sales_nav" | "recruiter" | "unknown";

export interface ParsedLinkedInLead {
  name: string;
  email?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  linkedInUrl?: string;
  industry?: string;
}

export interface LinkedInParseResult {
  format: LinkedInFormat;
  leads: ParsedLinkedInLead[];
  errors: string[];
  totalRows: number;
}

// LinkedIn Basic (Connections export)
// Headers: First Name, Last Name, Email Address, Company, Position, Connected On
// Note: LinkedIn CSV exports have 3 header lines to skip
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
        company: row["Company"]?.trim() || "N/A",
        jobTitle: row["Position"]?.trim() || undefined,
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

/**
 * Parse un fichier CSV LinkedIn (Basic, Sales Navigator, ou Recruiter Lite)
 * Auto-detection du format.
 */
export function parseLinkedInCSV(content: string): LinkedInParseResult {
  const errors: string[] = [];

  // LinkedIn Basic export commence par des lignes de metadata
  // On essaie d'abord sans skip, puis avec skip si echec
  let cleanContent = content;

  // Detecter si les premieres lignes sont du metadata LinkedIn (pas des headers CSV)
  const firstLines = content.split("\n").slice(0, 5);
  const firstNonEmpty = firstLines.findIndex(
    (line) => line.includes(",") && !line.startsWith("Notes:")
  );
  if (firstNonEmpty > 0) {
    cleanContent = content.split("\n").slice(firstNonEmpty).join("\n");
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
      errors.push(
        "Format non reconnu. Headers detectes: " + headers.slice(0, 5).join(", ")
      );
      // Tenter un parsing generique
      leads = rows
        .map((row): ParsedLinkedInLead | null => {
          const name =
            row["Name"] ||
            row["Nom"] ||
            `${row["First Name"] || ""} ${row["Last Name"] || ""}`.trim();
          const company =
            row["Company"] || row["Entreprise"] || row["Current Company"] || "";

          if (!name || !company) return null;

          return {
            name,
            email: row["Email"] || row["Email Address"] || undefined,
            company,
            jobTitle:
              row["Title"] || row["Position"] || row["Current Title"] || undefined,
            location: row["Location"] || undefined,
            linkedInUrl:
              row["LinkedIn URL"] || row["Profile URL"] || undefined,
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
  };
}
