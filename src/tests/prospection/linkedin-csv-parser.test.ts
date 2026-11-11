import { describe, it, expect } from "vitest";
import { parseLinkedInCSV, mapRowsToLeads } from "@/lib/prospection/linkedin-csv-parser";

describe("parseLinkedInCSV", () => {
  it("détecte le format Basic malgré le préambule 'Notes:' de LinkedIn", () => {
    const csv = [
      "Notes:",
      '"When exporting your connection data, you may notice that some of the email addresses are missing, this is because the connection has set their privacy preferences."',
      "",
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Jean,Dupont,https://www.linkedin.com/in/jeandupont,jean@acme.fr,Acme Corp,Ingenieur,01 Jan 2024",
      "Marie,Martin,https://www.linkedin.com/in/mariemartin,,Beta SAS,CTO,02 Feb 2024",
    ].join("\n");

    const result = parseLinkedInCSV(csv);

    expect(result.format).toBe("basic");
    expect(result.leads).toHaveLength(2);
    expect(result.leads[0]).toMatchObject({
      name: "Jean Dupont",
      email: "jean@acme.fr",
      company: "Acme Corp",
      jobTitle: "Ingenieur",
      linkedInUrl: "https://www.linkedin.com/in/jeandupont",
    });
    expect(result.leads[1].linkedInUrl).toBe("https://www.linkedin.com/in/mariemartin");
  });

  it("parse normalement un CSV Basic sans préambule (pas de régression)", () => {
    const csv = [
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Jean,Dupont,https://www.linkedin.com/in/jeandupont,jean@acme.fr,Acme Corp,Ingenieur,01 Jan 2024",
    ].join("\n");

    const result = parseLinkedInCSV(csv);

    expect(result.format).toBe("basic");
    expect(result.leads).toHaveLength(1);
  });

  it("ne touche jamais au contenu d'un CSV générique sans marqueur 'Notes:'", () => {
    const csv = ["Nom complet,Societe,Fonction,Mail", "Paul Petit,Gamma SARL,Directeur,paul@gamma.fr"].join("\n");

    const result = parseLinkedInCSV(csv);

    expect(result.format).toBe("unknown");
    expect(result.headers).toEqual(["Nom complet", "Societe", "Fonction", "Mail"]);
    expect(result.rows).toHaveLength(1);
  });

  it("strip le BOM en début de fichier", () => {
    const csv = "﻿First Name,Last Name,Email Address,Company,Position,Connected On\nJean,Dupont,jean@acme.fr,Acme,Ingenieur,01 Jan 2024";

    const result = parseLinkedInCSV(csv);

    expect(result.format).toBe("basic");
    expect(result.leads).toHaveLength(1);
  });
});

describe("mapRowsToLeads", () => {
  it("applique un mapping manuel de colonnes génériques (CRM/Excel)", () => {
    const csv = ["Nom complet,Societe,Fonction,Mail", "Paul Petit,Gamma SARL,Directeur,paul@gamma.fr"].join("\n");
    const { rows } = parseLinkedInCSV(csv);

    const leads = mapRowsToLeads(rows, {
      name: "Nom complet",
      company: "Societe",
      jobTitle: "Fonction",
      email: "Mail",
    });

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      name: "Paul Petit",
      company: "Gamma SARL",
      jobTitle: "Directeur",
      email: "paul@gamma.fr",
    });
  });

  it("concatène name + nameSecondary quand prénom/nom sont séparés", () => {
    const csv = ["Prenom,Nom,Entreprise", "Paul,Petit,Gamma SARL"].join("\n");
    const { rows } = parseLinkedInCSV(csv);

    const leads = mapRowsToLeads(rows, { name: "Prenom", nameSecondary: "Nom", company: "Entreprise" });

    expect(leads[0].name).toBe("Paul Petit");
  });

  it("exclut les lignes sans nom résolu", () => {
    const csv = ["Nom,Societe", ",Gamma SARL", "Paul,Beta"].join("\n");
    const { rows } = parseLinkedInCSV(csv);

    const leads = mapRowsToLeads(rows, { name: "Nom", company: "Societe" });

    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Paul");
  });
});
