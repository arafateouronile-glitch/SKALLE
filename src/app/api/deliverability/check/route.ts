import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";

export const runtime = "nodejs";

// Common DKIM selectors to probe
const DKIM_SELECTORS = [
  "default", "google", "mail", "selector1", "selector2",
  "k1", "k2", "dkim", "email", "mailjet", "sendgrid",
  "mandrill", "amazonses", "smtp", "postmark", "zoho",
];

interface DkimResult {
  selector: string;
  found: boolean;
  value?: string;
}

export interface DeliverabilityCheckResult {
  domain: string;
  checkedAt: string;
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  spf: {
    found: boolean;
    valid: boolean;
    record?: string;
    issues: string[];
  };
  dkim: {
    found: boolean;
    selectors: DkimResult[];
    issues: string[];
  };
  dmarc: {
    found: boolean;
    valid: boolean;
    policy?: "none" | "quarantine" | "reject";
    record?: string;
    issues: string[];
  };
  mx: {
    found: boolean;
    records: string[];
    issues: string[];
  };
  recommendations: { severity: "critical" | "warning" | "info"; text: string }[];
}

async function checkSpf(domain: string): Promise<DeliverabilityCheckResult["spf"]> {
  try {
    const records = await dns.resolveTxt(domain);
    const spfRecords = records
      .map((r) => r.join(""))
      .filter((r) => r.startsWith("v=spf1"));

    if (spfRecords.length === 0) {
      return { found: false, valid: false, issues: ["Aucun enregistrement SPF trouvé"] };
    }
    if (spfRecords.length > 1) {
      return {
        found: true,
        valid: false,
        record: spfRecords[0],
        issues: ["Plusieurs enregistrements SPF détectés — seul un seul est autorisé (RFC 7208)"],
      };
    }

    const record = spfRecords[0];
    const issues: string[] = [];

    if (!record.includes("~all") && !record.includes("-all") && !record.includes("?all")) {
      issues.push("SPF sans mécanisme 'all' — risque d'être ignoré par certains serveurs");
    }
    if (record.includes("+all")) {
      issues.push("SPF avec '+all' autorise tout le monde à envoyer — très dangereux");
    }
    // Count DNS lookups (each include: counts as 1, max 10)
    const lookups = (record.match(/include:|a:|mx:|ptr:/g) ?? []).length;
    if (lookups > 10) {
      issues.push(`SPF dépasse 10 lookups DNS (${lookups} détectés) — peut causer des échecs`);
    }

    return { found: true, valid: issues.length === 0, record, issues };
  } catch {
    return { found: false, valid: false, issues: ["Impossible de résoudre les enregistrements TXT du domaine"] };
  }
}

async function checkDkim(domain: string): Promise<DeliverabilityCheckResult["dkim"]> {
  const results = await Promise.all(
    DKIM_SELECTORS.map(async (selector): Promise<DkimResult> => {
      try {
        const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        const value = records.map((r) => r.join("")).find((r) => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="));
        return { selector, found: !!value, value };
      } catch {
        return { selector, found: false };
      }
    })
  );

  const found = results.some((r) => r.found);
  const issues: string[] = [];
  if (!found) {
    issues.push("Aucun enregistrement DKIM trouvé pour les sélecteurs courants");
  }

  return { found, selectors: results.filter((r) => r.found), issues };
}

async function checkDmarc(domain: string): Promise<DeliverabilityCheckResult["dmarc"]> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = records
      .map((r) => r.join(""))
      .find((r) => r.startsWith("v=DMARC1"));

    if (!dmarcRecord) {
      return { found: false, valid: false, issues: ["Aucun enregistrement DMARC trouvé"] };
    }

    const issues: string[] = [];
    const policyMatch = dmarcRecord.match(/p=(none|quarantine|reject)/);
    const policy = (policyMatch?.[1] ?? "none") as "none" | "quarantine" | "reject";

    if (policy === "none") {
      issues.push("Politique DMARC sur 'none' — aucune action corrective n'est prise en cas d'échec");
    }
    if (!dmarcRecord.includes("rua=")) {
      issues.push("Pas d'adresse de rapport agrégé (rua=) — vous ne recevrez pas de rapports DMARC");
    }

    const spfAlignMatch = dmarcRecord.match(/aspf=([rs])/);
    if (spfAlignMatch?.[1] === "r") {
      // relaxed is fine
    }

    return { found: true, valid: true, policy, record: dmarcRecord, issues };
  } catch {
    return {
      found: false,
      valid: false,
      issues: ["Aucun enregistrement DMARC trouvé — les emails non authentifiés ne sont pas protégés"],
    };
  }
}

async function checkMx(domain: string): Promise<DeliverabilityCheckResult["mx"]> {
  try {
    const records = await dns.resolveMx(domain);
    const sorted = records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    return { found: sorted.length > 0, records: sorted.slice(0, 5), issues: [] };
  } catch {
    return { found: false, records: [], issues: ["Aucun enregistrement MX — le domaine ne peut pas recevoir d'emails"] };
  }
}

function computeScore(
  spf: DeliverabilityCheckResult["spf"],
  dkim: DeliverabilityCheckResult["dkim"],
  dmarc: DeliverabilityCheckResult["dmarc"],
  mx: DeliverabilityCheckResult["mx"]
): { score: number; grade: "A" | "B" | "C" | "D" | "F" } {
  let score = 0;

  // SPF: 25 pts
  if (spf.found && spf.valid) score += 25;
  else if (spf.found) score += 10;

  // DKIM: 35 pts (most important for reputation)
  if (dkim.found) score += 35;

  // DMARC: 30 pts
  if (dmarc.found && dmarc.valid) {
    if (dmarc.policy === "reject") score += 30;
    else if (dmarc.policy === "quarantine") score += 22;
    else score += 10; // none
  }

  // MX: 10 pts
  if (mx.found) score += 10;

  const grade: "A" | "B" | "C" | "D" | "F" =
    score >= 90 ? "A" :
    score >= 75 ? "B" :
    score >= 50 ? "C" :
    score >= 30 ? "D" : "F";

  return { score, grade };
}

function buildRecommendations(
  spf: DeliverabilityCheckResult["spf"],
  dkim: DeliverabilityCheckResult["dkim"],
  dmarc: DeliverabilityCheckResult["dmarc"]
): DeliverabilityCheckResult["recommendations"] {
  const recs: DeliverabilityCheckResult["recommendations"] = [];

  if (!spf.found) {
    recs.push({
      severity: "critical",
      text: "Ajoutez un enregistrement SPF : créez un TXT sur votre domaine avec `v=spf1 include:_spf.google.com ~all` (adaptez selon votre fournisseur email).",
    });
  } else if (!spf.valid) {
    spf.issues.forEach((i) => recs.push({ severity: "warning", text: `SPF : ${i}` }));
  }

  if (!dkim.found) {
    recs.push({
      severity: "critical",
      text: "Configurez DKIM dans votre fournisseur email (Google Workspace, Microsoft 365, etc.) et activez la signature DKIM — c'est le facteur le plus important pour la réputation d'envoi.",
    });
  }

  if (!dmarc.found) {
    recs.push({
      severity: "critical",
      text: "Ajoutez un enregistrement DMARC : créez un TXT sur `_dmarc.votredomaine.com` avec `v=DMARC1; p=none; rua=mailto:dmarc@votredomaine.com` pour commencer à recevoir des rapports.",
    });
  } else if (dmarc.policy === "none") {
    recs.push({
      severity: "warning",
      text: "Évoluez votre politique DMARC de 'none' vers 'quarantine' puis 'reject' après avoir analysé vos rapports — cela protège votre domaine du spoofing.",
    });
  }

  if (spf.found && dkim.found && dmarc.found) {
    recs.push({
      severity: "info",
      text: "Authentification email correctement configurée. Pensez à un warmup progressif si c'est un nouveau domaine (commencez par 20 emails/jour, doublez chaque semaine).",
    });
  }

  return recs;
}

export async function POST(req: NextRequest) {
  try {
    const { domain } = await req.json() as { domain?: string };
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "domain requis" }, { status: 400 });
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(cleanDomain)) {
      return NextResponse.json({ error: "Domaine invalide" }, { status: 400 });
    }

    const [spf, dkim, dmarc, mx] = await Promise.all([
      checkSpf(cleanDomain),
      checkDkim(cleanDomain),
      checkDmarc(cleanDomain),
      checkMx(cleanDomain),
    ]);

    const { score, grade } = computeScore(spf, dkim, dmarc, mx);
    const recommendations = buildRecommendations(spf, dkim, dmarc);

    const result: DeliverabilityCheckResult = {
      domain: cleanDomain,
      checkedAt: new Date().toISOString(),
      score,
      grade,
      spf,
      dkim,
      dmarc,
      mx,
      recommendations,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[deliverability/check]", error);
    return NextResponse.json({ error: "Erreur lors de l'analyse" }, { status: 500 });
  }
}
