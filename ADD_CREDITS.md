# 💰 Ajouter des Crédits

## 🔴 Problème

Vous avez **0 crédits** et avez besoin de **10 crédits** pour l'analyse SEO Intelligence.

## ✅ Solutions

### Option 1 : Via Script (Recommandé pour développement)

Exécutez le script pour ajouter des crédits à votre compte :

```bash
# Trouvez d'abord votre email utilisateur
# Puis exécutez :
tsx scripts/add-credits.ts votre-email@example.com 100
```

Cela ajoutera 100 crédits à votre compte.

### Option 2 : Via Action Serveur (Depuis le code)

Si vous avez accès à une page d'administration ou si vous voulez créer un bouton, vous pouvez utiliser l'action serveur :

```typescript
import { addCreditsToUser } from "@/actions/credits";

// Ajouter 100 crédits
const result = await addCreditsToUser(100, "bonus");
```

### Option 3 : Directement dans la Base de Données

Si vous avez accès à Supabase, exécutez ce SQL :

```sql
-- Trouvez votre ID utilisateur
SELECT id, email, credits FROM "User" WHERE email = 'votre-email@example.com';

-- Ajoutez 100 crédits
UPDATE "User" 
SET credits = credits + 100 
WHERE email = 'votre-email@example.com';
```

### Option 4 : Reset Mensuel (Selon votre plan)

Si vous êtes sur le plan FREE, vous avez droit à 100 crédits par mois. Vous pouvez réinitialiser vos crédits :

```sql
-- Reset selon le plan
UPDATE "User" 
SET credits = CASE 
  WHEN plan = 'FREE' THEN 100
  WHEN plan = 'BUSINESS' THEN 500
  WHEN plan = 'AGENCY' THEN 2000
  WHEN plan = 'SCALE' THEN 10000
  ELSE 100
END
WHERE email = 'votre-email@example.com';
```

## 📊 Limites par Plan

- **FREE** : 100 crédits/mois
- **BUSINESS** : 500 crédits/mois
- **AGENCY** : 2000 crédits/mois
- **SCALE** : 10000 crédits/mois

## 💡 Coût de l'Analyse SEO Intelligence

- **Coût** : 10 crédits par analyse
- **Avec 100 crédits** : Vous pouvez faire 10 analyses SEO Intelligence

## 🚀 Action Rapide

Pour ajouter rapidement 100 crédits, exécutez :

```bash
tsx scripts/add-credits.ts votre-email@example.com 100
```

Remplacez `votre-email@example.com` par votre email de connexion.
