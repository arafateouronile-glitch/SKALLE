# 🔧 Instructions de Migration - SEO Intelligence Fields

## ⚠️ Problème Identifié

Les erreurs `Unknown argument 'globalScore'`, `Unknown argument 'metadata'`, etc. indiquent que la base de données n'a pas encore les nouveaux champs optimisés dans la table `SEOAudit`.

**Champs manquants** :
- `globalScore` (Int)
- `metadata` (JSON)
- `targetKeywords` (JSON)
- `competitors` (JSON)
- `actionPlan` (JSON)

## ✅ Solution

### Option 1 : Migration Automatique (Recommandé)

Exécutez la migration Prisma :

```bash
npx prisma migrate dev
```

Cela va :
1. Créer tous les nouveaux champs (`globalScore`, `metadata`, `targetKeywords`, `competitors`, `actionPlan`)
2. Copier les valeurs de `score` vers `globalScore` pour les enregistrements existants
3. Régénérer le client Prisma avec les nouveaux types

### Option 2 : Migration Manuelle

Si vous préférez exécuter la migration manuellement :

```bash
# 1. Générer le client Prisma
npx prisma generate

# 2. Appliquer la migration
npx prisma migrate deploy
```

Ou directement en SQL (voir le fichier de migration créé) :

```sql
-- Ajouter tous les nouveaux champs
ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "globalScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "targetKeywords" JSONB;
ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "competitors" JSONB;
ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "actionPlan" JSONB;

-- Copier les valeurs de score vers globalScore
UPDATE "SEOAudit" SET "globalScore" = COALESCE("score", 0) WHERE "globalScore" = 0;
```

## 🔄 Code Temporaire (Backward Compatible)

En attendant la migration, le code a été modifié pour être **100% backward compatible** :

### Lors de la Sauvegarde
- Stocke toutes les nouvelles données dans le champ `report` existant
- Utilise `score` au lieu de `globalScore` lors de la création
- Les nouvelles données structurées sont incluses dans `report.metadata`, `report.targetKeywords`, etc.

### Lors de la Lecture
- Détecte automatiquement si les nouveaux champs existent (`hasNewFields`)
- Si oui : utilise directement `audit.metadata`, `audit.targetKeywords`, etc.
- Si non : extrait depuis `audit.report.metadata`, `audit.report.targetKeywords`, etc.
- Fallback : `globalScore ?? score ?? report.globalScore ?? 0`

**Cela permet au code de fonctionner même sans la migration**, mais il est **fortement recommandé d'exécuter la migration** pour avoir le schéma optimisé.

## 📝 Fichier de Migration Créé

Le fichier de migration a été créé dans :
```
prisma/migrations/20260214200653_add_global_score_seo_audit/migration.sql
```

## ✅ Après la Migration

Une fois la migration exécutée, vous pouvez :
1. Retirer les fallbacks `?? audit.score` du code
2. Utiliser directement `globalScore` partout
3. Le code fonctionnera de manière optimale

## 🚀 Commandes Rapides

```bash
# Option 1 : Migration complète (recommandé)
npx prisma migrate dev

# Option 2 : Juste générer le client (si migration déjà appliquée)
npx prisma generate

# Option 3 : Vérifier l'état des migrations
npx prisma migrate status
```

---

**Note** : Le code fonctionne actuellement avec un fallback, mais pour une expérience optimale, exécutez la migration.
