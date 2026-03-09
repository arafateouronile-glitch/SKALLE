/**
 * 💧 B2B Lead Enrichment Engine — Waterfall Dropcontact
 *
 * Trouve l'email professionnel et le profil LinkedIn d'un dirigeant
 * à partir de son prénom, nom et nom d'entreprise.
 *
 * Stratégie :
 *   1. Dropcontact (si DROPCONTACT_API_KEY configuré) — async/polling
 *   2. Mock data (dev / démo sans clé API)
 *
 * Note : n'appeler qu'après filtrage secteur pour économiser le budget API.
 */

import type { EmailStatus } from "./newborn-leads";

export interface EnrichmentResult {
  email: string | null;
  emailStatus: EmailStatus;
  linkedInUrl: string | null;
  phone: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INTÉGRATION API DROPCONTACT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrichit un contact via Dropcontact (async + polling).
 * Timeout : 30 secondes (6 tentatives × 5s).
 */
export async function enrichLeadContact(
  firstName: string,
  lastName: string,
  companyName: string,
  website?: string
): Promise<EnrichmentResult> {
  const apiKey = process.env.DROPCONTACT_API_KEY;

  if (!apiKey) {
    console.warn("[Enrichment] DROPCONTACT_API_KEY manquant — enrichissement ignoré (email non trouvé).");
    return { email: null, emailStatus: "NOT_FOUND", linkedInUrl: null, phone: null };
  }

  try {
    // Étape 1 : Soumettre la demande d'enrichissement
    const submitRes = await fetch("https://api.dropcontact.io/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": apiKey,
      },
      body: JSON.stringify({
        data: [
          {
            first_name: firstName,
            last_name: lastName,
            company: companyName,
            website: website ?? null,
          },
        ],
        siren: false,
        language: "FR",
      }),
    });

    if (!submitRes.ok) {
      throw new Error(`Dropcontact submit: HTTP ${submitRes.status}`);
    }

    const submitData = (await submitRes.json()) as {
      request_id?: string;
      error?: boolean;
      reason?: string;
      credits_used?: number;
    };

    if (submitData.error || !submitData.request_id) {
      throw new Error(submitData.reason ?? "Dropcontact: request_id manquant");
    }

    const requestId = submitData.request_id;

    // Étape 2 : Polling du résultat (max 30s)
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(5000);

      const pollRes = await fetch(
        `https://api.dropcontact.io/batch/${requestId}`,
        { headers: { "X-Access-Token": apiKey } }
      );

      if (!pollRes.ok) continue;

      const pollData = (await pollRes.json()) as {
        success?: boolean;
        data?: Array<{
          email?: Array<{ email: string; qualification: string }>;
          linkedin?: string;
          phone?: string;
        }>;
      };

      if (!pollData.success || !pollData.data?.[0]) continue;

      const contact = pollData.data[0];
      const emails = contact.email ?? [];
      const best = emails[0];

      return {
        email: best?.email ?? null,
        emailStatus: best ? mapDropcontactQual(best.qualification) : "NOT_FOUND",
        linkedInUrl: contact.linkedin ?? null,
        phone: contact.phone ?? null,
      };
    }

    // Timeout atteint
    return { email: null, emailStatus: "UNKNOWN", linkedInUrl: null, phone: null };
  } catch (err) {
    console.error("[Enrichment] Dropcontact error:", err);
    return { email: null, emailStatus: "UNKNOWN", linkedInUrl: null, phone: null };
  }
}

function mapDropcontactQual(qual: string): Exclude<EmailStatus, "NOT_FOUND"> {
  if (qual === "verified") return "VERIFIED";
  if (qual === "catch_all") return "CATCH_ALL";
  return "UNKNOWN";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MOCK DATA (Dev / Démo)
// ═══════════════════════════════════════════════════════════════════════════

function getMockEnrichment(
  firstName: string,
  lastName: string,
  companyName: string
): EnrichmentResult {
  // Génère un email plausible à partir du nom d'entreprise
  const domain = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 15);

  const fn = firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const ln = lastName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const email = `${fn}.${ln}@${domain || "entreprise"}.fr`;

  // Distribution réaliste des statuts pour la démo
  const statuses: EmailStatus[] = ["VERIFIED", "VERIFIED", "CATCH_ALL", "UNKNOWN", "NOT_FOUND"];
  const idx = Math.floor(
    (firstName.charCodeAt(0) + lastName.charCodeAt(0) + companyName.charCodeAt(0)) %
      statuses.length
  );
  const emailStatus = statuses[idx];

  return {
    email: emailStatus !== "NOT_FOUND" ? email : null,
    emailStatus,
    linkedInUrl: null,
    phone: null,
  };
}
