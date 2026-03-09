# 🔧 Fix: Colonne `updatedAt` manquante

## 🔴 Problème

L'erreur suivante apparaît :
```
The column `updatedAt` does not exist in the current database.
```

La table `SEOAudit` a été créée sans la colonne `updatedAt` dans la migration initiale, mais le schéma Prisma actuel la définit avec `@updatedAt`.

---

## ✅ Solution

Une migration a été créée pour ajouter la colonne `updatedAt` :
- **Fichier** : `prisma/migrations/20260215000000_add_updated_at_seo_audit/migration.sql`

---

## 🚀 Application de la Migration

### Option 1 : Appliquer automatiquement (recommandé)

```bash
npx prisma migrate deploy
```

### Option 2 : Appliquer manuellement dans Supabase

Exécutez le SQL suivant dans l'éditeur SQL de Supabase :

```sql
-- Add updatedAt column if it doesn't exist
ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Update existing records to set updatedAt to createdAt if it's null
UPDATE "SEOAudit" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
```

Puis marquez la migration comme appliquée :

```bash
npx prisma migrate resolve --applied 20260215000000_add_updated_at_seo_audit
```

---

## ✅ Vérification

Après avoir appliqué la migration, vérifiez que la colonne existe :

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'SEOAudit' AND column_name = 'updatedAt';
```

---

## 📝 Note

Une fois la migration appliquée, le code fonctionnera correctement car Prisma gère automatiquement `updatedAt` avec `@updatedAt` dans le schéma.
