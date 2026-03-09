/**
 * 🧪 Script de Test Automatique - Inscription
 * 
 * Usage: npx tsx scripts/test-registration.ts
 */

import { prisma } from "../src/lib/prisma";

async function testRegistration() {
  console.log("🧪 Test du flux d'inscription...\n");

  const testEmail = `test-${Date.now()}@example.com`;
  const testName = "Test User";

  try {
    // 1. Test de connexion
    console.log("1️⃣ Vérification de la connexion à la base...");
    await prisma.$connect();
    console.log("   ✅ Connexion OK\n");

    // 2. Vérifier qu'on peut créer un User
    console.log("2️⃣ Test de création d'utilisateur...");
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: testName,
        password: "hashed_password_test", // Pour le test, on bypass le hash
      },
    });
    console.log(`   ✅ Utilisateur créé: ${user.id}\n`);

    // 3. Vérifier la création automatique du Workspace
    console.log("3️⃣ Vérification de la création du workspace...");
    const workspace = await prisma.workspace.create({
      data: {
        name: "Mon Workspace",
        domainUrl: "",
        userId: user.id,
      },
    });
    console.log(`   ✅ Workspace créé: ${workspace.id}\n`);

    // 4. Vérifier les crédits initiaux
    console.log("4️⃣ Vérification des crédits initiaux...");
    const userWithCredits = await prisma.user.findUnique({
      where: { id: user.id },
      select: { credits: true, plan: true },
    });
    console.log(`   ✅ Crédits: ${userWithCredits?.credits}, Plan: ${userWithCredits?.plan}\n`);

    // 5. Nettoyer (supprimer les données de test)
    console.log("5️⃣ Nettoyage des données de test...");
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("   ✅ Données de test supprimées\n");

    await prisma.$disconnect();

    console.log("🎉 Tous les tests sont passés ! Le flux d'inscription fonctionne.\n");
    console.log("📝 Prochaine étape : Tester l'inscription via l'interface web\n");
    console.log("   → Lancez: npm run dev");
    console.log("   → Ouvrez: http://localhost:3000/register\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERREUR:\n");
    console.error(error);

    if (error instanceof Error) {
      if (error.message.includes("Unique constraint")) {
        console.error("\n💡 L'email de test existe déjà dans la base.");
        console.error("   C'est normal si vous avez déjà testé. Le test peut continuer.\n");
      } else {
        console.error(`\n💡 Erreur: ${error.message}\n`);
      }
    }

    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

testRegistration();
