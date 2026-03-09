/**
 * Active hasCsoAccess = true pour tous les workspaces (ou un user précis)
 * Usage:
 *   tsx scripts/activate-cso-access.ts
 *   tsx scripts/activate-cso-access.ts user@example.com
 */

import prisma from "../src/lib/prisma";

const emailArg = process.argv[2];

async function main() {
  const workspaces = await prisma.workspace.findMany({
    where: emailArg
      ? { user: { email: emailArg } }
      : { hasCsoAccess: false },
    select: {
      id: true,
      name: true,
      hasCsoAccess: true,
      user: { select: { email: true } },
    },
  });

  if (workspaces.length === 0) {
    console.log("✅ Tous les workspaces ont déjà hasCsoAccess = true.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n🔑 Activation CSO pour ${workspaces.length} workspace(s):\n`);

  for (const ws of workspaces) {
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { hasCsoAccess: true },
    });
    console.log(`  ✅ "${ws.name}" (${ws.user.email}) → CSO activé`);
  }

  console.log("\n✅ Terminé !\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Erreur :", e);
  await prisma.$disconnect();
  process.exit(1);
});
