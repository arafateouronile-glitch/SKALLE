import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth";

describe("hashPassword / verifyPassword", () => {
  it("hash un mot de passe et le vérifie correctement", async () => {
    const password = "MonMotDePasse123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[ab]\$/); // bcrypt format
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejette un mot de passe incorrect", async () => {
    const hash = await hashPassword("correct-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("génère des hashes différents pour le même mot de passe (salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
    // Les deux doivent quand même vérifier correctement
    await expect(verifyPassword("same-password", hash1)).resolves.toBe(true);
    await expect(verifyPassword("same-password", hash2)).resolves.toBe(true);
  });
});
