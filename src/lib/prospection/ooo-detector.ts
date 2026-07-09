/**
 * Out-of-Office (OOO) detector
 * Détecte les messages d'absence automatiques dans les réponses email.
 * Supporte FR + EN. Extrait la date de retour quand elle est présente.
 */

export interface OOODetectionResult {
  isOOO: boolean;
  confidence: "high" | "medium" | "low";
  returnDate: Date | null;
  returnDateRaw: string | null;
}

// ─── Subject-line patterns ────────────────────────────────────────────────────
// High confidence — these almost never appear in real replies

const SUBJECT_PATTERNS_HIGH = [
  /\baut[o]?[- ]?r[ée]ponse\b/i,       // auto-réponse, autoreponse
  /\br[ée]ponse automatique\b/i,         // réponse automatique
  /\babsence (du bureau|automatique)\b/i,
  /\bhors (du )?bureau\b/i,             // hors du bureau, hors bureau
  /\ben d[ée]placement\b/i,
  /\bcong[ée]\b/i,
  /\bvacances?\b/i,
  /\bout of (the )?office\b/i,
  /\bauto[- ]?reply\b/i,
  /\bautomatic (reply|response)\b/i,
  /\baway (from (the )?office)?\b/i,
  /\bon vacation\b/i,
  /\bon leave\b/i,
  /\bI('m| am) away\b/i,
];

// ─── Body patterns ────────────────────────────────────────────────────────────

const BODY_PATTERNS_HIGH = [
  /je suis (actuellement |en ce moment )?absent/i,
  /je suis (actuellement )?en (cong[ée]|vacances|d[ée]placement)/i,
  /je ne (serai|suis) pas (disponible|au bureau|joignable)/i,
  /je r[ée]ponds? (à )?[^.]{0,40}(d[eè]s mon retour|à mon retour|en rentrant)/i,
  /hors (du )?bureau (jusqu'au?|du)/i,
  /I (am|will be|'m) (currently |)?(away|out of (the )?office|on vacation|on leave|unavailable)/i,
  /I will (be back|return|respond)/i,
  /I('ll| will) (get back|reply) (to you )?(when I return|upon my return|on my return)/i,
  /this is an (auto|automatic)[- ]?(reply|response|generated)/i,
  /this message was sent automatically/i,
  /thank you for your (email|message)[^.]{0,60}(away|out of office|vacation)/i,
];

const BODY_PATTERNS_MEDIUM = [
  /je serai de retour/i,
  /de retour (le |à partir du? )/i,
  /mon retour est pr[ée]vu/i,
  /will be back on/i,
  /returning (on|from)/i,
  /back in (the )?office (on|from)/i,
  /during my absence/i,
  /pendant mon absence/i,
  /en mon absence/i,
];

// ─── Date extraction ──────────────────────────────────────────────────────────

const MONTH_FR: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
  fevrier: 1, aout: 7,
};

const MONTH_EN: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function extractReturnDate(text: string): { date: Date | null; raw: string | null } {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ISO date: 2026-07-15
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (d > now) return { date: d, raw: isoMatch[0] };
  }

  // DD/MM/YYYY or DD/MM/YY
  const dmyMatch = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (dmyMatch) {
    const year = dmyMatch[3].length === 2 ? 2000 + parseInt(dmyMatch[3]) : parseInt(dmyMatch[3]);
    const d = new Date(year, parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (d > now) return { date: d, raw: dmyMatch[0] };
  }

  // FR: "le 15 juillet 2026" / "15 juillet" / "le 15 juillet"
  const frDateMatch = text.match(
    /\b(?:le )?(\d{1,2})\s+([a-zéûèàâô]+)\b(?:\s+(\d{4}))?/i
  );
  if (frDateMatch) {
    const day = parseInt(frDateMatch[1]);
    const monthName = frDateMatch[2].toLowerCase();
    const monthIdx = MONTH_FR[monthName];
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      const year = frDateMatch[3] ? parseInt(frDateMatch[3]) : currentYear;
      const d = new Date(year, monthIdx, day);
      if (d > now) return { date: d, raw: frDateMatch[0].trim() };
      // Try next year
      const dNextYear = new Date(year + 1, monthIdx, day);
      if (!frDateMatch[3] && dNextYear > now) return { date: dNextYear, raw: frDateMatch[0].trim() };
    }
  }

  // EN: "July 15, 2026" / "July 15" / "15 July 2026"
  const enDateMatch = text.match(
    /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\b/
  );
  if (enDateMatch) {
    const monthName = enDateMatch[1].toLowerCase();
    const monthIdx = MONTH_EN[monthName];
    const day = parseInt(enDateMatch[2]);
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      const year = enDateMatch[3] ? parseInt(enDateMatch[3]) : currentYear;
      const d = new Date(year, monthIdx, day);
      if (d > now) return { date: d, raw: enDateMatch[0].trim() };
      const dNextYear = new Date(year + 1, monthIdx, day);
      if (!enDateMatch[3] && dNextYear > now) return { date: dNextYear, raw: enDateMatch[0].trim() };
    }
  }

  // EN: "15 July 2026"
  const enDateMatch2 = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:[,\s]+(\d{4}))?\b/
  );
  if (enDateMatch2) {
    const day = parseInt(enDateMatch2[1]);
    const monthName = enDateMatch2[2].toLowerCase();
    const monthIdx = MONTH_EN[monthName];
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      const year = enDateMatch2[3] ? parseInt(enDateMatch2[3]) : currentYear;
      const d = new Date(year, monthIdx, day);
      if (d > now) return { date: d, raw: enDateMatch2[0].trim() };
    }
  }

  return { date: null, raw: null };
}

// ─── Main detector ────────────────────────────────────────────────────────────

export function detectOOO(subject: string, body: string): OOODetectionResult {
  const combined = `${subject}\n${body}`;

  // High confidence: subject match
  for (const pattern of SUBJECT_PATTERNS_HIGH) {
    if (pattern.test(subject)) {
      const { date, raw } = extractReturnDate(combined);
      return { isOOO: true, confidence: "high", returnDate: date, returnDateRaw: raw };
    }
  }

  // High confidence: body match
  for (const pattern of BODY_PATTERNS_HIGH) {
    if (pattern.test(body)) {
      const { date, raw } = extractReturnDate(combined);
      return { isOOO: true, confidence: "high", returnDate: date, returnDateRaw: raw };
    }
  }

  // Medium confidence: body match
  for (const pattern of BODY_PATTERNS_MEDIUM) {
    if (pattern.test(body)) {
      const { date, raw } = extractReturnDate(combined);
      return { isOOO: true, confidence: "medium", returnDate: date, returnDateRaw: raw };
    }
  }

  return { isOOO: false, confidence: "low", returnDate: null, returnDateRaw: null };
}

/**
 * Calcule la date de réactivation d'une séquence après OOO.
 * Si on a une date de retour, on envoie le jour suivant.
 * Sinon, fallback à 14 jours.
 */
export function getResumeDate(oooResult: OOODetectionResult): Date {
  if (oooResult.returnDate) {
    const resume = new Date(oooResult.returnDate);
    resume.setDate(resume.getDate() + 1); // jour après le retour
    resume.setHours(9, 0, 0, 0);          // 9h du matin
    return resume;
  }
  // Fallback: 14 jours
  const resume = new Date();
  resume.setDate(resume.getDate() + 14);
  resume.setHours(9, 0, 0, 0);
  return resume;
}
