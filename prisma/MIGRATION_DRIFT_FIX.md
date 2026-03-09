# Dépannage : drift des migrations Prisma

## Ce qui s’est passé

- La base de données a été modifiée (via `db push` ou d’autres migrations) et ne correspond plus à l’historique des fichiers de migration locaux.
- Une migration appliquée en base (`20240214120000_add_global_score_seo_audit`) n’existe plus dans le dossier local.
- Des migrations ont été modifiées après avoir été appliquées.

## À faire tout de suite

1. **À la question « Do you want to continue? All data will be lost »**  
   → Répondre **N** (Ne pas réinitialiser).

2. **Synchroniser le schéma sans effacer les données**  
   ```bash
   npx prisma db push
   ```
   Cela aligne la base sur `schema.prisma` (colonnes/tables manquants ajoutés) **sans** toucher à l’historique des migrations et **sans** supprimer les données.

3. **Régénérer le client** (déjà fait normalement)  
   ```bash
   npx prisma generate
   ```

Après ça, l’app devrait fonctionner (champ `source` sur `Prospect`, etc.).

## Plus tard : repartir proprement sur les migrations (optionnel)

Si tu veux que `prisma migrate dev` fonctionne à nouveau sans drift :

- En **développement** avec une base que tu peux réinitialiser : tu peux faire un reset puis rejouer toutes les migrations (en ayant d’abord corrigé/supprimé les doublons de migrations comme `add_global_score_seo_audit`).
- En **production** ou si tu ne veux pas perdre les données : il faut « baseliner » (marquer l’état actuel de la base comme point de départ des migrations). Doc : https://www.prisma.io/docs/guides/migrate/production-troubleshooting#baselining

Pour l’instant, **N** + `prisma db push` suffit pour continuer à développer sans perte de données.
