/**
 * 🔌 Script de Test de Connexion à Supabase
 * 
 * Usage: npx tsx scripts/test-db-connection.ts
 */

import { prisma } from "../src/lib/prisma";

async function testConnection() {
  console.log("🔌 Test de connexion à la base de données...\n");

  try {
    // 1. Test de connexion
    console.log("1️⃣ Test de connexion...");
    await prisma.$connect();
    console.log("   ✅ Connexion réussie!\n");

    // 2. Test de requête simple
    console.log("2️⃣ Test de requête simple...");
    const userCount = await prisma.user.count();
    console.log(`   ✅ Nombre d'utilisateurs: ${userCount}\n`);

    // 3. Test de création (optionnel - commenté pour éviter de polluer)
    // console.log("3️⃣ Test de création...");
    // const testUser = await prisma.user.create({
    //   data: {
    //     email: `test-${Date.now()}@example.com`,
    //     name: "Test User",
    //   },
    // });
    // console.log(`   ✅ Utilisateur test créé: ${testUser.id}`);
    // await prisma.user.delete({ where: { id: testUser.id } });
    // console.log("   ✅ Utilisateur test supprimé\n");

    // 4. Vérifier les tables principales
    console.log("3️⃣ Vérification des tables...");
    const tables = {
      users: await prisma.user.count(),
      workspaces: await prisma.workspace.count(),
      posts: await prisma.post.count(),
      prospects: await prisma.prospect.count(),
      audits: await prisma.sEOAudit.count(),
      autopilotConfigs: await prisma.autopilotConfig.count(),
      batchJobs: await prisma.batchJob.count(),
    };

    console.log("   ✅ Tables vérifiées:");
    Object.entries(tables).forEach(([table, count]) => {
      console.log(`      - ${table}: ${count}`);
    });

    // 5. Test de déconnexion
    console.log("\n4️⃣ Déconnexion...");
    await prisma.$disconnect();
    console.log("   ✅ Déconnexion réussie!\n");

    console.log("🎉 Tous les tests sont passés! La base de données est prête.\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERREUR:\n");
    console.error(error);

    if (error instanceof Error) {
      if (error.message.includes("P1010")) {
        console.error("\n💡 Solution: Vérifiez votre DATABASE_URL dans .env");
        console.error("   - Le mot de passe est-il correct?");
        console.error("   - L'URL de connexion est-elle valide?");
      } else if (error.message.includes("P1001")) {
        console.error("\n💡 Solution: Impossible de se connecter au serveur");
        console.error("   - Le projet Supabase est-il actif?");
        console.error("   - Vérifiez votre connexion internet");
      } else if (error.message.includes("relation") && error.message.includes("does not exist")) {
        console.error("\n💡 Solution: Les migrations ne sont pas appliquées");
        console.error("   - Exécutez: npx prisma migrate dev");
      }
    }

    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

testConnection();
