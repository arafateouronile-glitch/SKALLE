# ⚠️ Problème de Migration Détecté

## 🔴 Erreur

L'erreur suivante apparaît :
```
The column `metadata` does not exist in the current database.
```

Cela signifie que **les colonnes n'ont pas été créées** dans la base de données, même si `prisma migrate deploy` a indiqué que les migrations ont été appliquées.

---

## ✅ Solution Temporaire

Le code a été modifié pour utiliser **uniquement les champs existants** (`report`, `score`) jusqu'à ce que les migrations soient correctement appliquées.

Toutes les nouvelles données sont stockées dans le champ `report` avec la structure suivante :
```json
{
  ...report,
  metadata: {...},
  targetKeywords: [...],
  competitors: [...],
  actionPlan: {...},
  globalScore: 60
}
```

---

## 🔧 Solution Définitive

Pour résoudre le problème définitivement, vous devez :

### Option 1 : Vérifier et réappliquer les migrations manuellement

1. **Vérifier l'état de la base de données** :
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'SEOAudit' 
   ORDER BY column_name;
   ```

2. **Si les colonnes n'existent pas**, exécuter manuellement le SQL de migration :
   ```sql
   ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "globalScore" INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
   ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "targetKeywords" JSONB;
   ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "competitors" JSONB;
   ALTER TABLE "SEOAudit" ADD COLUMN IF NOT EXISTS "actionPlan" JSONB;
   UPDATE "SEOAudit" SET "globalScore" = COALESCE("score", 0) WHERE "globalScore" = 0;
   ```

3. **Marquer les migrations comme appliquées** :
   ```bash
   npx prisma migrate resolve --applied 20260214200653_add_global_score_seo_audit
   ```

### Option 2 : Réinitialiser et réappliquer les migrations

1. **Vérifier les migrations en attente** :
   ```bash
   npx prisma migrate status
   ```

2. **Si nécessaire, réappliquer** :
   ```bash
   npx prisma migrate deploy
   ```

3. **Vérifier que les colonnes existent** :
   ```bash
   npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'SEOAudit';"
   ```

---

## ✅ Compatibilité

Le code fonctionne maintenant avec **les deux formats** :
- ✅ **Ancien format** : Données dans `report` (fonctionne maintenant)
- ✅ **Nouveau format** : Données dans les champs dédiés (sera disponible après migration)

Les fonctions de lecture (`audit-helpers.ts`, `seo-actions.ts`) ont déjà la logique de fallback pour extraire les données depuis `report` si les nouveaux champs n'existent pas.

---

## 📝 Note

Une fois les migrations correctement appliquées et les colonnes créées, vous pouvez modifier `discovery.ts` pour utiliser directement les nouveaux champs au lieu de tout stocker dans `report`.
