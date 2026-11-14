import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Régression pour le fix de performance de `importLeads` : la boucle
 * séquentielle (1 `findFirst` + 1 `create`/`update` par ligne, jusqu'à 1000+
 * allers-retours DB pour un import de 500 lignes, plusieurs minutes de blocage
 * observées en pratique) a été remplacée par un dédoublonnage en mémoire +
 * 1 `findMany` + 1 `createManyAndReturn`. Ces tests vérifient que les
 * compteurs (`imported`/`duplicates`) et la fusion de champs restent
 * identiques au comportement d'origine.
 */

const {
  authMock,
  workspaceFindFirst,
  prospectFindMany,
  prospectCreateManyAndReturn,
  prospectUpdate,
  prospectListEntryCreateMany,
  inngestSend,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  workspaceFindFirst: vi.fn(),
  prospectFindMany: vi.fn(),
  prospectCreateManyAndReturn: vi.fn(),
  prospectUpdate: vi.fn(),
  prospectListEntryCreateMany: vi.fn(() => Promise.resolve({ count: 0 })),
  inngestSend: vi.fn<(events: unknown[]) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findFirst: workspaceFindFirst },
    prospect: {
      findMany: prospectFindMany,
      createManyAndReturn: prospectCreateManyAndReturn,
      update: prospectUpdate,
    },
    prospectListEntry: { createMany: prospectListEntryCreateMany },
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: inngestSend },
}));

import { importLeads } from "@/actions/leads";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user-1", email: "test@test.com" } });
  workspaceFindFirst.mockResolvedValue({ id: "ws-1" });
  prospectFindMany.mockResolvedValue([]);
  prospectCreateManyAndReturn.mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) =>
    Promise.resolve(
      data.map((d, i) => ({
        id: `new-${i}`,
        name: d.name,
        email: d.email ?? null,
        company: d.company,
        jobTitle: d.jobTitle ?? null,
      }))
    )
  );
  prospectUpdate.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve({
      id: where.id,
      name: data.name,
      email: data.email ?? null,
      company: data.company,
      jobTitle: data.jobTitle ?? null,
    })
  );
});

describe("importLeads — leads 100% nouveaux", () => {
  it("crée tout en un seul createManyAndReturn et envoie les events Inngest en un seul send", async () => {
    const leads = [
      { name: "Alice Martin", email: "alice@acme.fr", company: "Acme" },
      { name: "Bob Dupont", email: "bob@acme.fr", company: "Acme" },
    ];

    const res = await importLeads("ws-1", leads);

    expect(res.success).toBe(true);
    expect(res.imported).toBe(2);
    expect(res.duplicates).toBe(0);
    expect(res.errors).toBe(0);
    expect(prospectCreateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(prospectUpdate).not.toHaveBeenCalled();
    expect(inngestSend).toHaveBeenCalledTimes(1);
    const sentEvents = inngestSend.mock.calls[0][0] as Array<{ name: string }>;
    expect(sentEvents).toHaveLength(2);
    expect(sentEvents.every((e) => e.name === "prospect/created")).toBe(true);
  });
});

describe("importLeads — doublons contre l'existant en base", () => {
  it("fusionne les champs (dont le SIREN) et compte en duplicates, pas en imported", async () => {
    prospectFindMany.mockResolvedValue([
      {
        id: "existing-1",
        name: "Alice M.",
        email: "alice@acme.fr",
        phone: null,
        linkedInUrl: "",
        company: "Acme SAS",
        jobTitle: null,
        location: null,
        industry: null,
        emailVerified: true,
        enrichmentData: { naf: "6201Z" },
      },
    ]);

    const res = await importLeads("ws-1", [
      { name: "Alice Martin", email: "alice@acme.fr", company: "Acme", jobTitle: "CEO", siren: "123456789" },
    ]);

    expect(res.success).toBe(true);
    expect(res.imported).toBe(0);
    expect(res.duplicates).toBe(1);
    expect(prospectCreateManyAndReturn).not.toHaveBeenCalled();
    expect(prospectUpdate).toHaveBeenCalledTimes(1);

    const updateData = prospectUpdate.mock.calls[0][0].data;
    expect(updateData.name).toBe("Alice Martin");
    expect(updateData.jobTitle).toBe("CEO");
    // Le SIREN s'ajoute sans écraser les clés déjà présentes (ex: `naf`).
    expect(updateData.enrichmentData).toEqual({ naf: "6201Z", siren: "123456789" });
  });
});

describe("importLeads — doublons internes au fichier", () => {
  it("fusionne en mémoire une même adresse email apparaissant deux fois, sans aller-retour DB supplémentaire", async () => {
    const leads = [
      { name: "Chloé Petit", email: "chloe@startup.io", company: "Startup" },
      { name: "Chloé Petit", email: "chloe@startup.io", company: "Startup", jobTitle: "CTO" },
    ];

    const res = await importLeads("ws-1", leads);

    expect(res.success).toBe(true);
    expect(res.imported).toBe(1);
    expect(res.duplicates).toBe(1);
    expect(prospectCreateManyAndReturn).toHaveBeenCalledTimes(1);
    const createdData = prospectCreateManyAndReturn.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(createdData).toHaveLength(1);
    expect(createdData[0].jobTitle).toBe("CTO");
  });
});
