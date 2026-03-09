/**
 * Script pour ajouter des crédits à un utilisateur
 * Usage: tsx scripts/add-credits.ts <email> <amount>
 */

import { prisma } from "../src/lib/prisma";
import { addCredits } from "../src/lib/credits";

async function main() {
  const email = process.argv[2];
  const amount = parseInt(process.argv[3] || "100");

  if (!email) {
    console.error("Usage: tsx scripts/add-credits.ts <email> <amount>");
    console.error("Exemple: tsx scripts/add-credits.ts user@example.com 100");
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, credits: true, plan: true },
    });

    if (!user) {
      console.error(`❌ Utilisateur non trouvé: ${email}`);
      process.exit(1);
    }

    console.log(`📊 Utilisateur trouvé:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Plan: ${user.plan}`);
    console.log(`   Crédits actuels: ${user.credits}`);
    console.log(`\n➕ Ajout de ${amount} crédits...`);

    const result = await addCredits(user.id, amount, "bonus");

    if (result.success) {
      console.log(`✅ Crédits ajoutés avec succès!`);
      console.log(`   Nouveau solde: ${result.newBalance} crédits`);
    } else {
      console.error(`❌ Erreur lors de l'ajout de crédits`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
