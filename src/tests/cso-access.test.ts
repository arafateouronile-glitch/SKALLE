import { describe, it, expect } from "vitest";
import { planIncludesCso, canAccessCso } from "@/lib/credits";

describe("planIncludesCso", () => {
  it("exclut FREE", () => {
    expect(planIncludesCso("FREE")).toBe(false);
  });

  it("inclut BUSINESS, AGENCY, SCALE", () => {
    expect(planIncludesCso("BUSINESS")).toBe(true);
    expect(planIncludesCso("AGENCY")).toBe(true);
    expect(planIncludesCso("SCALE")).toBe(true);
  });
});

describe("canAccessCso", () => {
  it("bloque un nouveau FREE sans flag legacy", () => {
    expect(canAccessCso({ plan: "FREE" }, { hasCsoAccess: false })).toBe(false);
  });

  it("laisse passer un FREE avec le flag legacy (grandfather)", () => {
    expect(canAccessCso({ plan: "FREE" }, { hasCsoAccess: true })).toBe(true);
  });

  it("accorde l'accès à un payant même sans flag écrit", () => {
    expect(canAccessCso({ plan: "BUSINESS" }, { hasCsoAccess: false })).toBe(true);
  });

  it("accorde l'accès à un payant même si le workspace est absent", () => {
    expect(canAccessCso({ plan: "AGENCY" }, null)).toBe(true);
    expect(canAccessCso({ plan: "SCALE" }, undefined)).toBe(true);
  });

  it("bloque un FREE sans workspace", () => {
    expect(canAccessCso({ plan: "FREE" }, null)).toBe(false);
  });
});
