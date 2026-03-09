/**
 * Script d'activation de l'accès Skalle CMO pour les workspaces existants.
 *
 * Usage :
 *   tsx scripts/activate-cmo-access.ts                         → active TOUS les workspaces
 *   tsx scripts/activate-cmo-access.ts user@example.com        → active pour un user précis
 *   tsx scripts/activate-cmo-access.ts --dry-run               → simulation sans écriture
 *   tsx scripts/activate-cmo-access.ts user@example.com --dry-run
 *
 * Options :
 *   --cso   Active aussi hasCsoAccess en même temps que hasCmoAccess
 */

import { prisma } from "../src/lib/prisma";

// ─── Parsing des arguments ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const activateCso = args.includes("--cso");
const emailArg = args.find((a) => !a.startsWith("--"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg);
}

function logSection(title: string) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(50));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  logSection("🔑 Activation Skalle CMO Access");

  if (isDryRun) {
    log("⚠️  MODE DRY-RUN — aucune modification ne sera effectuée\n");
  }

  if (activateCso) {
    log("ℹ️  --cso activé : hasCsoAccess sera aussi mis à true\n");
  }

  // 1. Trouver les workspaces à mettre à jour
  let workspaces: Array<{
    id: string;
    name: string;
    hasCmoAccess: boolean;
    hasCsoAccess: boolean;
    user: { email: string; plan: string };
  }>;

  if (emailArg) {
    // Mode ciblé : un seul utilisateur
    const user = await prisma.user.findUnique({
      where: { email: emailArg },
      select: {
        email: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            hasCmoAccess: true,
            hasCsoAccess: true,
          },
        },
      },
    });

    if (!user) {
      console.error(`❌ Utilisateur non trouvé : ${emailArg}`);
      process.exit(1);
    }

    if (user.workspaces.length === 0) {
      console.error(`❌ Aucun workspace pour ${emailArg}`);
      process.exit(1);
    }

    workspaces = user.workspaces.map((w) => ({
      ...w,
      user: { email: user.email, plan: "N/A" },
    }));
  } else {
    // Mode global : tous les workspaces sans accès CMO
    const all = await prisma.workspace.findMany({
      where: { hasCmoAccess: false },
      select: {
        id: true,
        name: true,
        hasCmoAccess: true,
        hasCsoAccess: true,
        user: { select: { email: true, plan: true } },
      },
    });
    workspaces = all;
  }

  // 2. Afficher le bilan avant action
  if (workspaces.length === 0) {
    log("✅ Tous les workspaces ont déjà hasCmoAccess = true. Rien à faire.");
    await prisma.$disconnect();
    return;
  }

  log(`📋 ${workspaces.length} workspace(s) à mettre à jour :\n`);

  for (const ws of workspaces) {
    const csoTag = activateCso ? " + CSO" : "";
    log(
      `  • [${ws.id.slice(0, 8)}...] "${ws.name}" — ${ws.user.email}` +
        `  (CMO actuel: ${ws.hasCmoAccess ? "✅" : "❌"}, CSO actuel: ${ws.hasCsoAccess ? "✅" : "❌"})` +
        `  → Activation CMO${csoTag}`
    );
  }

  if (isDryRun) {
    log(`\n🔍 Dry-run terminé — ${workspaces.length} workspace(s) seraient mis à jour.`);
    log("   Relancez sans --dry-run pour appliquer.");
    await prisma.$disconnect();
    return;
  }

  // 3. Confirmation manuelle si > 10 workspaces et mode global
  if (!emailArg && workspaces.length > 10) {
    log(
      `\n⚠️  Vous êtes sur le point de modifier ${workspaces.length} workspaces.`
    );
    log(
      "   Pour confirmer, relancez avec l'email d'un utilisateur précis, ou passez --dry-run d'abord."
    );
    log("   Si vous voulez vraiment tout activer, supprimez ce guard dans le script.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // 4. Mise à jour
  log("\n🚀 Application des changements...\n");

  let updated = 0;
  let failed = 0;

  for (const ws of workspaces) {
    try {
      await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          hasCmoAccess: true,
          ...(activateCso && { hasCsoAccess: true }),
        },
      });
      log(`  ✅ "${ws.name}" (${ws.user.email}) → CMO activé`);
      updated++;
    } catch (e) {
      log(`  ❌ "${ws.name}" (${ws.user.email}) → Erreur: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // 5. Résumé final
  logSection("📊 Résumé");
  log(`  ✅ Succès : ${updated} workspace(s)`);
  if (failed > 0) log(`  ❌ Échecs : ${failed} workspace(s)`);
  log("");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Erreur fatale :", e);
  await prisma.$disconnect();
  process.exit(1);
});
