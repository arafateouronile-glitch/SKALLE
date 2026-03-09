# 🚀 Guide de Configuration Supabase pour Skalle

## Étape 1 : Créer un Projet Supabase

1. **Aller sur [supabase.com](https://supabase.com)**
2. Cliquer sur **"Start your project"** ou **"New Project"**
3. Se connecter avec GitHub/Google (ou créer un compte)
4. Cliquer sur **"New Project"**
5. Remplir les informations :
   - **Name**: `skalle-production` (ou `skalle-dev` pour le dev)
   - **Database Password**: Générer un mot de passe fort (⚠️ LE NOTER)
   - **Region**: Choisir la région la plus proche (ex: `West Europe (Paris)`)
   - **Pricing Plan**: Free (pour commencer)
6. Cliquer sur **"Create new project"**
7. ⏳ Attendre 2-3 minutes que la base de données soit prête

---

## Étape 2 : Récupérer la Connection String

1. Dans votre projet Supabase, aller dans **Settings** (⚙️) → **Database**
2. Scroll jusqu'à **Connection string**
3. Sélectionner **"URI"**
4. Copier la chaîne qui ressemble à :
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. **Important**: Remplacer `[YOUR-PASSWORD]` par le mot de passe que vous avez noté à l'étape 1

---

## Étape 3 : Configurer le `.env` Local

1. Dans le dossier `skalle`, créer/modifier le fichier `.env` :
   ```bash
   cd /Users/arafatetoure/Documents/SKALLE/skalle
   ```

2. Ajouter ou mettre à jour `DATABASE_URL` :
   ```env
   # Base de données Supabase
   DATABASE_URL="postgresql://postgres:VOTRE_MOT_DE_PASSE@db.xxxxx.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
   
   # Pour la connexion directe (migrations)
   # DATABASE_URL_DIRECT="postgresql://postgres:VOTRE_MOT_DE_PASSE@db.xxxxx.supabase.co:5432/postgres"
   ```

   **Note**: Si vous avez des problèmes de connexion, utiliser `DATABASE_URL_DIRECT` pour les migrations.

---

## Étape 4 : Migrer le Schéma Prisma

Une fois `DATABASE_URL` configuré dans `.env` :

```bash
# 1. Générer le client Prisma
npx prisma generate

# 2. Créer et appliquer la migration
npx prisma migrate dev --name init

# 3. Vérifier que tout fonctionne
npx prisma studio
```

**Si erreur de connexion** :
- Vérifier que le mot de passe est correct
- Vérifier que l'URL ne contient pas d'espaces
- Essayer avec `DATABASE_URL_DIRECT` pour les migrations

---

## Étape 5 : Vérifier la Migration

1. Dans Supabase, aller dans **Table Editor**
2. Vous devriez voir toutes les tables créées :
   - `User`
   - `Workspace`
   - `Post`
   - `Prospect`
   - `SEOAudit`
   - `AutopilotConfig`
   - etc.

3. Dans **SQL Editor**, tester une requête :
   ```sql
   SELECT COUNT(*) FROM "User";
   ```

---

## Étape 6 : Configurer Row Level Security (RLS) - Optionnel

Pour la sécurité, activer RLS sur les tables sensibles :

```sql
-- Dans SQL Editor de Supabase

-- Activer RLS sur User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Politique : les users ne peuvent voir que leur propre compte
CREATE POLICY "Users can view own profile"
  ON "User" FOR SELECT
  USING (auth.uid()::text = id);

-- Répéter pour Workspace, Post, etc.
```

⚠️ **Note**: Pour l'instant, on laisse RLS désactivé car on utilise NextAuth.js, pas l'auth Supabase.

---

## Étape 7 : Tester la Connexion

Créer un script de test :

```bash
# Tester la connexion
npm run db:test
```

Ou manuellement :
```typescript
// test-connection.ts
import { prisma } from './src/lib/prisma';

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Connexion à Supabase réussie!');
    
    const userCount = await prisma.user.count();
    console.log(`📊 Nombre d'utilisateurs: ${userCount}`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erreur de connexion:', error);
  }
}

test();
```

---

## 🐛 Dépannage

### Erreur "Connection refused"
- Vérifier que le projet Supabase est bien actif
- Vérifier le firewall (Supabase autorise toutes les IPs par défaut)

### Erreur "password authentication failed"
- Vérifier le mot de passe dans `DATABASE_URL`
- Réinitialiser le mot de passe dans Supabase si nécessaire

### Erreur "relation does not exist"
- Relancer `npx prisma migrate dev`

### Erreur P1010 (Database access denied)
- Vérifier que l'URL de connexion est correcte
- S'assurer que le projet Supabase n'est pas suspendu

---

## 📊 Monitoring dans Supabase

- **Table Editor**: Voir/modifier les données
- **SQL Editor**: Exécuter des requêtes SQL
- **Database Logs**: Voir les requêtes en temps réel
- **API**: Utiliser l'API REST auto-générée (optionnel)

---

## ✅ Checklist de Validation

- [ ] Projet Supabase créé
- [ ] `DATABASE_URL` configuré dans `.env`
- [ ] Migration Prisma appliquée (`npx prisma migrate dev`)
- [ ] Tables visibles dans Table Editor
- [ ] Test de connexion réussi
- [ ] `npx prisma studio` fonctionne

---

**Une fois tout validé, vous pouvez passer à l'étape 2 : Tester le flux complet !** 🎉
