/**
 * Script pour tester les modèles Claude disponibles
 * Usage: npx tsx scripts/test-claude-models.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Charger les variables d'environnement
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../.env.local") });

import { ChatAnthropic } from "@langchain/anthropic";

const modelsToTest = [
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229",
  "claude-sonnet-4-5-20250929",
  "claude-3-7-sonnet-20250219",
];

async function testModel(modelName: string): Promise<boolean> {
  try {
    const model = new ChatAnthropic({
      model: modelName,
      temperature: 0.7,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await model.invoke([
      {
        role: "user",
        content: "Test",
      },
    ]);

    console.log(`✅ ${modelName}: OK`);
    return true;
  } catch (error: any) {
    if (error?.status === 404 || error?.error?.type === "not_found_error") {
      console.log(`❌ ${modelName}: Not found (404)`);
    } else {
      console.log(`⚠️  ${modelName}: ${error?.message || error?.error?.message || error}`);
    }
    return false;
  }
}

async function main() {
  console.log("🧪 Test des modèles Claude disponibles...\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY non définie");
    process.exit(1);
  }

  const results: { model: string; works: boolean }[] = [];

  for (const model of modelsToTest) {
    const works = await testModel(model);
    results.push({ model, works });
    await new Promise((resolve) => setTimeout(resolve, 500)); // Pause entre les tests
  }

  console.log("\n📊 Résumé:");
  const workingModels = results.filter((r) => r.works);
  if (workingModels.length > 0) {
    console.log("\n✅ Modèles qui fonctionnent:");
    workingModels.forEach((r) => console.log(`   - ${r.model}`));
  } else {
    console.log("\n❌ Aucun modèle ne fonctionne. Vérifiez votre clé API.");
  }
}

main().catch(console.error);
