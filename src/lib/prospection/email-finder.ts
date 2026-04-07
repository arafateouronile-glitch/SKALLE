/**
 * 📧 Email Finder Maison - Recherche d'emails réels sans API payante
 *
 * Stratégie en 3 étapes (par ordre de fiabilité) :
 * 1. Google Search → cherche l'email de la personne directement sur le web
 * 2. Scraping site entreprise → visite /contact, /team, /equipe, homepage
 * 3. Pattern + MX fallback → génère les patterns courants et vérifie le domaine MX
 *
 * Optimisations :
 * - Cache domaine par entreprise (évite N appels Google pour la même société)
 * - Guess direct du domaine avant d'appeler Serper (économise des crédits)
 * - Scraping homepage en plus des pages /contact /team
 * - 2 formulations Google si la première échoue
 */

import * as cheerio from "cheerio";
import dns from "dns";
import { promisify } from "util";
import { searchGoogle } from "@/lib/ai/serper";
import { logger } from "@/lib/logger";

const resolveMx = promisify(dns.resolveMx);

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailFindResult {
  email: string;
  score: number; // 0-100 (confiance)
  source: "apollo" | "google-search" | "website-scrape" | "pattern-mx";
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 CACHE DOMAINE - évite de chercher le même domaine plusieurs fois
// ═══════════════════════════════════════════════════════════════════════════

const domainCache = new Map<string, string | null>();

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILS
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const DIRECTORY_DOMAINS = [
  "linkedin.com", "facebook.com", "societe.com", "pappers.fr",
  "kompass.com", "manageo.fr", "verif.com", "infogreffe.fr",
  "pages-jaunes.fr", "lafourchette.com", "tripadvisor.com",
];

const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com", "hotmail.com", "yahoo.com", "outlook.com",
  "free.fr", "orange.fr", "laposte.net", "sfr.fr", "wanadoo.fr",
];

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function extractEmails(text: string): string[] {
  return [...new Set(text.match(EMAIL_REGEX) || [])].filter(
    (e) =>
      !e.includes("example") &&
      !e.includes("test@") &&
      !e.endsWith(".png") &&
      !e.endsWith(".jpg") &&
      e.length < 80
  );
}

function isPersonalEmail(email: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.includes(email.split("@")[1]);
}

function isDirectoryUrl(url: string): boolean {
  return DIRECTORY_DOMAINS.some((d) => url.includes(d));
}

async function hasMXRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const fn = normalizeStr(firstName);
  const ln = normalizeStr(lastName);
  if (!fn || !ln) return [];
  return [
    `${fn}.${ln}@${domain}`,
    `${fn[0]}${ln}@${domain}`,
    `${fn}@${domain}`,
    `${fn}${ln}@${domain}`,
    `${fn[0]}.${ln}@${domain}`,
    `${ln}.${fn}@${domain}`,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 DOMAIN RESOLVER - guess direct + fallback Google
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tente de deviner le domaine directement depuis le nom de l'entreprise
 * sans appel API (BNP Paribas → bnpparibas.fr / bnpparibas.com)
 */
async function guessDomainDirect(company: string): Promise<string | null> {
  const slug = company
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*(sas|sarl|sa|eurl|sasu|groupe|group|consulting|conseil|france|international|services)\s*/gi, " ")
    .trim()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 25);

  if (!slug) return null;

  for (const tld of [".fr", ".com"]) {
    const domain = `${slug}${tld}`;
    const hasMX = await hasMXRecords(domain);
    if (hasMX) return domain;
  }

  return null;
}

/**
 * Cherche le domaine officiel via Google (fallback si guess échoue)
 */
async function findDomainViaGoogle(company: string): Promise<string | null> {
  if (!process.env.SERPER_API_KEY) return null;

  try {
    const results = await searchGoogle(`${company} site officiel`, 3);
    for (const result of results) {
      if (isDirectoryUrl(result.link)) continue;
      try {
        const url = new URL(result.link);
        return url.hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Résolution de domaine avec cache : guess direct → Google
 */
async function resolveCompanyDomain(company: string): Promise<string | null> {
  const cacheKey = company.toLowerCase().trim();

  if (domainCache.has(cacheKey)) {
    return domainCache.get(cacheKey) ?? null;
  }

  const direct = await guessDomainDirect(company);
  if (direct) {
    domainCache.set(cacheKey, direct);
    return direct;
  }

  const fromGoogle = await findDomainViaGoogle(company);
  domainCache.set(cacheKey, fromGoogle);
  return fromGoogle;
}

// ═══════════════════════════════════════════════════════════════════════════
// 0️⃣ ÉTAPE 0 - Apollo People Match : email vérifié si clé API disponible
// ═══════════════════════════════════════════════════════════════════════════

async function findEmailViaApollo(name: string, company: string): Promise<EmailFindResult | null> {
  if (!process.env.APOLLO_API_KEY) return null;

  try {
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    if (!firstName || !lastName) return null;

    const response = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": process.env.APOLLO_API_KEY,
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        organization_name: company,
        reveal_personal_emails: false,
        reveal_phone_number: false,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const email = data.person?.email;
    if (!email || isPersonalEmail(email)) return null;

    const verified = data.person?.email_status === "verified";
    logger.debug("[EmailFinder] Email trouvé via Apollo", { name, email, verified });

    return {
      email,
      score: verified ? 98 : 80,
      source: "apollo",
    };
  } catch (err) {
    logger.debug("[EmailFinder] Apollo match échoué", { error: String(err) });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ ÉTAPE 1 - Google Search : cherche l'email de la personne sur le web
// ═══════════════════════════════════════════════════════════════════════════

async function findEmailViaGoogle(name: string, company: string): Promise<EmailFindResult | null> {
  if (!process.env.SERPER_API_KEY) return null;

  const companyShort = company.split(/\s+/).slice(0, 2).join(" ");

  // 2 formulations différentes
  const queries = [
    `"${name}" "${companyShort}" email contact`,
    `"${name}" "@${companyShort.toLowerCase().replace(/\s+/g, "")}"`,
  ];

  for (const query of queries) {
    try {
      const results = await searchGoogle(query, 5);
      for (const result of results) {
        const text = `${result.snippet} ${result.link}`;
        const emails = extractEmails(text).filter((e) => !isPersonalEmail(e));
        if (emails.length > 0) {
          logger.debug("[EmailFinder] Trouvé via Google search", { name, email: emails[0], query });
          return { email: emails[0], score: 75, source: "google-search" };
        }
      }
    } catch (err) {
      logger.debug("[EmailFinder] Google search échoué", { query, error: String(err) });
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ ÉTAPE 2 - Scraping site entreprise : visite les pages de contact
// ═══════════════════════════════════════════════════════════════════════════

async function scrapePageForEmails(url: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();

    // Chercher aussi dans les href="mailto:..."
    const mailtoEmails: string[] = [];
    $("a[href^='mailto:']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const email = href.replace("mailto:", "").split("?")[0].trim();
      if (email) mailtoEmails.push(email);
    });

    const textEmails = extractEmails($.root().text());
    return [...new Set([...mailtoEmails, ...textEmails])].filter((e) => !isPersonalEmail(e));
  } catch {
    return [];
  }
}

async function findEmailViaWebsite(company: string, name?: string): Promise<EmailFindResult | null> {
  try {
    const domain = await resolveCompanyDomain(company);
    if (!domain) return null;

    // Pages candidates : pages spécifiques + homepage (footer souvent utile)
    const pages = [
      `https://www.${domain}/contact`,
      `https://www.${domain}/equipe`,
      `https://www.${domain}/team`,
      `https://www.${domain}/about`,
      `https://www.${domain}/a-propos`,
      `https://${domain}/contact`,
      `https://www.${domain}`, // homepage — email souvent dans le footer
    ];

    let bestGeneric: string | null = null;

    for (const page of pages) {
      const emails = await scrapePageForEmails(page);
      if (emails.length === 0) continue;

      // Email nominatif (correspond au nom de la personne) → score max
      if (name) {
        const nameParts = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
        const matched = emails.find((e) => nameParts.some((part) => part.length > 2 && e.toLowerCase().includes(part)));
        if (matched) {
          logger.debug("[EmailFinder] Email nominatif via scraping", { name, email: matched, page });
          return { email: matched, score: 85, source: "website-scrape" };
        }
      }

      // Email générique → garder comme fallback
      if (!bestGeneric) {
        const generic = emails.find((e) => /^(contact|info|hello|bonjour|accueil|hello|direction)@/.test(e));
        if (generic) bestGeneric = generic;
      }
    }

    if (bestGeneric) {
      logger.debug("[EmailFinder] Email générique via scraping", { company, email: bestGeneric });
      return { email: bestGeneric, score: 50, source: "website-scrape" };
    }
  } catch (err) {
    logger.debug("[EmailFinder] Scraping échoué", { error: String(err) });
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ ÉTAPE 3 - Pattern + MX fallback : email probable si domaine valide
// ═══════════════════════════════════════════════════════════════════════════

async function findEmailViaPattern(name: string, company: string): Promise<EmailFindResult | null> {
  try {
    const domain = await resolveCompanyDomain(company);
    if (!domain) return null;

    const hasMX = await hasMXRecords(domain);
    if (!hasMX) return null;

    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    if (!firstName || !lastName) return null;

    const patterns = generateEmailPatterns(firstName, lastName, domain);
    if (patterns.length === 0) return null;

    logger.debug("[EmailFinder] Pattern MX généré", { name, email: patterns[0] });
    return { email: patterns[0], score: 40, source: "pattern-mx" };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FONCTION PRINCIPALE - Orchestration des 3 étapes
// ═══════════════════════════════════════════════════════════════════════════

export async function findEmail(
  name: string,
  company: string
): Promise<EmailFindResult | null> {
  if (!name || !company) return null;

  // Étape 0 : Apollo People Match (email vérifié, priorité absolue)
  const apolloResult = await findEmailViaApollo(name, company);
  if (apolloResult) return apolloResult;

  // Étape 1 : Google Search
  const googleResult = await findEmailViaGoogle(name, company);
  if (googleResult && googleResult.score >= 70) return googleResult;

  // Étape 2 : Scraping site entreprise
  const websiteResult = await findEmailViaWebsite(company, name);
  if (websiteResult) return websiteResult;

  // Étape 3 : Pattern + MX fallback
  const patternResult = await findEmailViaPattern(name, company);
  if (patternResult) return patternResult;

  if (googleResult) return googleResult;

  return null;
}

/**
 * Enrichit une liste de leads avec des emails (batches de 3 en parallèle)
 * Le cache domaine est partagé entre tous les leads du batch.
 */
export async function enrichLeadsWithEmails<T extends { name: string; company: string; email?: string }>(
  leads: T[]
): Promise<T[]> {
  const BATCH_SIZE = 5;
  const result: T[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const enriched = await Promise.all(
      batch.map(async (lead) => {
        if (lead.email) return lead;
        const found = await findEmail(lead.name, lead.company);
        if (!found) return lead;
        return {
          ...lead,
          email: found.email,
          emailVerified: found.source !== "pattern-mx",
          emailScore: found.score,
          enrichmentData: {
            ...(lead as any).enrichmentData,
            emailSource: found.source,
          },
        };
      })
    );
    result.push(...enriched);
  }

  return result;
}
