/**
 * 🎓 Sync du registre Qualiopi (data.gouv.fr) → cache local `QualiopiOrganism`
 *
 * Source : "Liste Publique des Organismes de Formation" (Code du travail
 * L.6351-7-1), fichier CSV `;`-délimité, mis à jour quotidiennement côté
 * gouvernement, aucune authentification requise. Format vérifié par
 * échantillonnage réel avant implémentation — colonnes utilisées :
 * `denomination`, `siren`, `numeroDeclarationActivite`,
 * `adressePhysiqueOrganismeFormation.{codePostal,ville,codeRegion}`,
 * `certifications.{actionsDeFormation,bilansDeCompetences,VAE,actionsDeFormationParApprentissage}`
 * (booléens texte "true"/"false"), `informationsDeclarees.nbStagiaires`.
 *
 * Pas de date de délivrance de certification dans ce fichier ouvert — cette
 * donnée existe côté France Compétences (API Entreprise), réservée aux
 * administrations habilitées DataPass avec usage commercial explicitement
 * exclu. Ce sync ne cible donc que le statut de certification, pas sa date.
 */

import Papa from "papaparse";
import { prisma } from "@/lib/prisma";

const CSV_URL =
  "https://www.monactiviteformation.emploi.gouv.fr/mon-activite-formation/public/listePubliqueOF?format=csv";
// Fallback : redirection stable côté data.gouv.fr si l'URL directe change.
const CSV_URL_FALLBACK = "https://www.data.gouv.fr/api/1/datasets/r/ac59a0f5-fa83-4b82-bf12-3c5806d4f19f";

const UPSERT_CONCURRENCY = 20;

interface QualiopiCsvRow {
  denomination?: string;
  siren?: string;
  numeroDeclarationActivite?: string;
  "adressePhysiqueOrganismeFormation.codePostal"?: string;
  "adressePhysiqueOrganismeFormation.ville"?: string;
  "adressePhysiqueOrganismeFormation.codeRegion"?: string;
  "certifications.actionsDeFormation"?: string;
  "certifications.bilansDeCompetences"?: string;
  "certifications.VAE"?: string;
  "certifications.actionsDeFormationParApprentissage"?: string;
  "informationsDeclarees.nbStagiaires"?: string;
}

interface QualiopiUpsertRow {
  siren: string;
  denomination: string;
  nda: string;
  region: string | null;
  city: string | null;
  zipCode: string | null;
  certifActionsFormation: boolean;
  certifBilanCompetences: boolean;
  certifVAE: boolean;
  certifApprentissage: boolean;
  nbStagiaires: number | null;
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function toRow(raw: QualiopiCsvRow): QualiopiUpsertRow | null {
  const siren = raw.siren?.replace(/"/g, "").trim();
  const denomination = raw.denomination?.replace(/"/g, "").trim();
  if (!siren || !denomination) return null;

  const certifActionsFormation = isTrue(raw["certifications.actionsDeFormation"]);
  const certifBilanCompetences = isTrue(raw["certifications.bilansDeCompetences"]);
  const certifVAE = isTrue(raw["certifications.VAE"]);
  const certifApprentissage = isTrue(raw["certifications.actionsDeFormationParApprentissage"]);

  // Filtre : au moins une catégorie certifiée — sinon c'est une simple déclaration
  // d'activité sans certification Qualiopi, hors périmètre de ce radar.
  if (!certifActionsFormation && !certifBilanCompetences && !certifVAE && !certifApprentissage) {
    return null;
  }

  const nbStagiairesRaw = raw["informationsDeclarees.nbStagiaires"]?.trim();
  const nbStagiaires = nbStagiairesRaw ? parseInt(nbStagiairesRaw, 10) : NaN;

  return {
    siren,
    denomination,
    nda: raw.numeroDeclarationActivite?.replace(/"/g, "").trim() ?? "",
    region: raw["adressePhysiqueOrganismeFormation.codeRegion"]?.trim() || null,
    city: raw["adressePhysiqueOrganismeFormation.ville"]?.replace(/"/g, "").trim() || null,
    zipCode: raw["adressePhysiqueOrganismeFormation.codePostal"]?.replace(/"/g, "").trim() || null,
    certifActionsFormation,
    certifBilanCompetences,
    certifVAE,
    certifApprentissage,
    nbStagiaires: Number.isFinite(nbStagiaires) ? nbStagiaires : null,
  };
}

async function downloadCsvText(): Promise<string> {
  for (const url of [CSV_URL, CSV_URL_FALLBACK]) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(120_000) });
      if (res.ok) return await res.text();
    } catch (err) {
      console.error(`[QualiopiSync] Échec téléchargement ${url}:`, err);
    }
  }
  throw new Error("Impossible de télécharger le registre Qualiopi (data.gouv.fr et fallback indisponibles)");
}

/**
 * Télécharge + parse le CSV complet en mémoire (fichier ~37 Mo — traitement en
 * tâche de fond hebdomadaire, pas par requête utilisateur). Si la durée/mémoire
 * devient un problème en environnement serverless, passer à un parsing en
 * streaming (`Papa.parse` sur un `Readable.fromWeb(res.body)`) plutôt que du
 * texte complet — non fait ici pour privilégier la simplicité/fiabilité au
 * premier jet.
 */
export async function fetchAndParseQualiopiRegistry(): Promise<QualiopiUpsertRow[]> {
  const text = await downloadCsvText();

  const parsed = Papa.parse<QualiopiCsvRow>(text, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    console.warn(
      `[QualiopiSync] ${parsed.errors.length} erreur(s) de parsing CSV (ex: ${parsed.errors[0]?.message})`
    );
  }

  const rows: QualiopiUpsertRow[] = [];
  for (const raw of parsed.data) {
    const row = toRow(raw);
    if (row) rows.push(row);
  }
  return rows;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Upsert par lots (concurrence bornée, pas un par un séquentiellement) — voir
 * note ci-dessus si le volume (potentiellement plusieurs dizaines de milliers
 * de lignes) s'avère trop lent en pratique : passer à un upsert SQL brut par
 * lot (`INSERT ... ON CONFLICT`) serait l'étape suivante.
 */
export async function upsertQualiopiOrganisms(rows: QualiopiUpsertRow[]): Promise<number> {
  let upserted = 0;
  for (const batch of chunk(rows, UPSERT_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map((row) =>
        prisma.qualiopiOrganism.upsert({
          where: { siren: row.siren },
          update: row,
          create: row,
        })
      )
    );
    upserted += results.filter((r) => r.status === "fulfilled").length;
  }
  return upserted;
}

export async function syncQualiopiRegistry(): Promise<{ rowsParsed: number; upserted: number }> {
  const rows = await fetchAndParseQualiopiRegistry();
  const upserted = await upsertQualiopiOrganisms(rows);
  return { rowsParsed: rows.length, upserted };
}
