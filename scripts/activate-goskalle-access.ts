/**
 * Active hasGoskalleAccess = true pour un workspace précis (produit en incubation,
 * pas de plan public — activation manuelle uniquement).
 * Usage:
 *   tsx scripts/activate-goskalle-access.ts user@example.com
 */

import prisma from "../src/lib/prisma";

const emailArg = process.argv[2];

async function main() {
  if (!emailArg) {
    console.error("❌ Usage: tsx scripts/activate-goskalle-access.ts user@example.com");
    await prisma.$disconnect();
    process.exit(1);
  }

  const workspaces = await prisma.workspace.findMany({
    where: { user: { email: emailArg } },
    select: { id: true, name: true, hasGoskalleAccess: true, user: { select: { email: true } } },
  });

  if (workspaces.length === 0) {
    console.log(`❌ Aucun workspace trouvé pour ${emailArg}.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n🔑 Activation Goskalle pour ${workspaces.length} workspace(s):\n`);

  for (const ws of workspaces) {
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { hasGoskalleAccess: true },
    });
    console.log(`  ✅ "${ws.name}" (${ws.user.email}) → Goskalle activé`);
  }

  console.log("\n✅ Terminé !\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Erreur :", e);
  await prisma.$disconnect();
  process.exit(1);
});
