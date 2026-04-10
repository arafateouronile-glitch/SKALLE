"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN GUARD
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) throw new Error("Accès admin requis");
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE — appelé par tous les workspaces (pas de vérification admin requise)
// ─────────────────────────────────────────────────────────────────────────────

type ContactInput = {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  emailScore?: number;
  emailSource?: string;
  phone?: string;
  linkedInUrl?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  seniority?: string;
  source?: string;
  apolloId?: string;
  sourceWorkspaceId?: string;
};

export async function saveContactsToDb(
  workspaceId: string,
  contacts: ContactInput[]
): Promise<{ success: boolean; saved: number; updated: number; skipped: number; error?: string }> {
  let saved = 0, updated = 0, skipped = 0;

  try {
    for (const c of contacts) {
      const email = c.email?.trim() || null;
      const linkedInUrl = c.linkedInUrl?.trim() || null;

      if (!email && !linkedInUrl) { skipped++; continue; }

      // Séparer prénom / nom depuis le champ `name` si firstName/lastName absents
      const nameParts = (c.name ?? "").trim().split(/\s+/);
      const firstName = c.firstName || nameParts[0] || null;
      const lastName = c.lastName || nameParts.slice(1).join(" ") || null;

      // Chercher un doublon par email OU LinkedIn
      const existing = await prisma.contactDB.findFirst({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(linkedInUrl ? [{ linkedInUrl }] : []),
          ],
        },
      });

      if (existing) {
        // Mise à jour intelligente : ne remplace que si la nouvelle info est meilleure
        await prisma.contactDB.update({
          where: { id: existing.id },
          data: {
            // Email : préférer le vérifié
            email: (c.emailVerified && !existing.emailVerified && email) ? email : (existing.email ?? email),
            emailVerified: existing.emailVerified || !!c.emailVerified,
            emailScore: Math.max(c.emailScore ?? 0, existing.emailScore ?? 0) || null,
            emailSource: (c.emailVerified && !existing.emailVerified) ? c.emailSource : existing.emailSource,
            // Compléter les champs vides
            firstName: existing.firstName || firstName,
            lastName: existing.lastName || lastName,
            phone: existing.phone || c.phone || null,
            linkedInUrl: existing.linkedInUrl || linkedInUrl,
            jobTitle: existing.jobTitle || c.jobTitle || null,
            location: existing.location || c.location || null,
            industry: existing.industry || c.industry || null,
            companySize: existing.companySize || c.companySize || null,
            apolloId: existing.apolloId || c.apolloId || null,
            lastVerifiedAt: c.emailVerified ? new Date() : existing.lastVerifiedAt,
            seenCount: { increment: 1 },
          },
        });
        updated++;
      } else {
        try {
          await prisma.contactDB.create({
            data: {
              firstName,
              lastName,
              email,
              emailVerified: !!c.emailVerified,
              emailScore: c.emailScore ?? null,
              emailSource: c.emailSource ?? null,
              phone: c.phone ?? null,
              linkedInUrl,
              company: c.company ?? null,
              jobTitle: c.jobTitle ?? null,
              location: c.location ?? null,
              industry: c.industry ?? null,
              companySize: c.companySize ?? null,
              seniority: c.seniority ?? null,
              source: c.source ?? "manual",
              apolloId: c.apolloId ?? null,
              sourceWorkspaceId: workspaceId,
              lastVerifiedAt: c.emailVerified ? new Date() : null,
              tags: [],
            },
          });
          saved++;
        } catch {
          // Contrainte unique violée en concurrence → update
          skipped++;
        }
      }
    }

    return { success: true, saved, updated, skipped };
  } catch (error) {
    return { success: false, saved, updated, skipped, error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ — admin uniquement
// ─────────────────────────────────────────────────────────────────────────────

export async function getContactsFromDb(opts: {
  page?: number;
  limit?: number;
  search?: string;
  emailVerifiedOnly?: boolean;
  source?: string;
  industry?: string;
} = {}): Promise<{
  success: boolean;
  contacts?: any[];
  total?: number;
  pages?: number;
  error?: string;
}> {
  try {
    await requireAdmin();

    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.emailVerifiedOnly) where.emailVerified = true;
    if (opts.source) where.source = opts.source;
    if (opts.industry) where.industry = { contains: opts.industry, mode: "insensitive" };
    if (opts.search) {
      where.OR = [
        { firstName: { contains: opts.search, mode: "insensitive" } },
        { lastName: { contains: opts.search, mode: "insensitive" } },
        { email: { contains: opts.search, mode: "insensitive" } },
        { company: { contains: opts.search, mode: "insensitive" } },
        { jobTitle: { contains: opts.search, mode: "insensitive" } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contactDB.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.contactDB.count({ where }),
    ]);

    return { success: true, contacts, total, pages: Math.ceil(total / limit) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getContactDbStats(): Promise<{
  success: boolean;
  total?: number;
  verified?: number;
  withLinkedIn?: number;
  companies?: number;
  bySource?: Record<string, number>;
  topCompanies?: { company: string; count: number }[];
  error?: string;
}> {
  try {
    await requireAdmin();

    const [total, verified, withLinkedIn, bySource, companiesRaw, topCompanies] = await Promise.all([
      prisma.contactDB.count(),
      prisma.contactDB.count({ where: { emailVerified: true } }),
      prisma.contactDB.count({ where: { linkedInUrl: { not: null } } }),
      prisma.contactDB.groupBy({ by: ["source"], _count: true }),
      prisma.contactDB.findMany({ where: { company: { not: null } }, select: { company: true }, distinct: ["company"] }),
      prisma.contactDB.groupBy({ by: ["company"], where: { company: { not: null } }, _count: { _all: true }, orderBy: { _count: { company: "desc" } }, take: 10 }),
    ]);

    const sourceMap: Record<string, number> = {};
    for (const s of bySource) sourceMap[s.source] = s._count;

    return {
      success: true,
      total,
      verified,
      withLinkedIn,
      companies: companiesRaw.length,
      bySource: sourceMap,
      topCompanies: topCompanies.map((t) => ({ company: t.company!, count: t._count._all })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteContact(contactId: string) {
  try {
    await requireAdmin();
    await prisma.contactDB.delete({ where: { id: contactId } });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function exportContactsCsv(): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    await requireAdmin();
    const contacts = await prisma.contactDB.findMany({ orderBy: { createdAt: "desc" } });

    const headers = ["Prénom", "Nom", "Email", "Email vérifié", "Score email", "Téléphone", "LinkedIn", "Entreprise", "Poste", "Localisation", "Industrie", "Source", "Apollo ID", "Vu", "Créé le"];
    const rows = contacts.map((c) => [
      c.firstName ?? "",
      c.lastName ?? "",
      c.email ?? "",
      c.emailVerified ? "oui" : "non",
      c.emailScore ?? "",
      c.phone ?? "",
      c.linkedInUrl ?? "",
      c.company ?? "",
      c.jobTitle ?? "",
      c.location ?? "",
      c.industry ?? "",
      c.source,
      c.apolloId ?? "",
      c.seenCount,
      c.createdAt.toISOString().split("T")[0],
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

    return { success: true, csv: [headers.join(","), ...rows].join("\n") };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
