# Guide de Configuration Supabase pour Skalle

## 📋 Étapes pour configurer Supabase

### 1. Créer un projet Supabase

1. Allez sur https://supabase.com
2. Cliquez sur **"Start your project"** ou **"New Project"**
3. Connectez-vous avec GitHub (recommandé)
4. Créez une nouvelle organisation si nécessaire
5. Cliquez sur **"New Project"**

### 2. Configurer le projet

- **Name** : `skalle` (ou le nom de votre choix)
- **Database Password** : Créez un mot de passe fort et **SAVEZ-LE** (vous en aurez besoin)
- **Region** : Choisissez la région la plus proche (ex: `West US (North California)` pour US, `West EU (Ireland)` pour Europe)
- Cliquez sur **"Create new project"**

⏱️ Attendez 2-3 minutes que le projet soit créé.

### 3. Récupérer la Connection String

Une fois le projet créé :

1. Allez dans **Settings** (⚙️) dans la sidebar gauche
2. Cliquez sur **Database**
3. Faites défiler jusqu'à **Connection string**
4. Sélectionnez **URI** (pas Transaction Pooler)
5. Cliquez sur **Copy** pour copier l'URL

L'URL ressemble à :
```
postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**⚠️ Important** : Remplacez `[YOUR-PASSWORD]` par le mot de passe que vous avez créé à l'étape 2.

### 4. Mettre à jour le fichier .env

Ajoutez ou remplacez la ligne `DATABASE_URL` dans votre fichier `.env` :

```bash
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:VOTRE_MOT_DE_PASSE@aws-0-[REGION].pooler.supabase.com:6543/postgres"
```

**Format complet recommandé** (avec paramètres de connexion) :
```bash
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:VOTRE_MOT_DE_PASSE@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
```

### 5. Pousser le schéma Prisma vers Supabase

Une fois la `DATABASE_URL` configurée :

```bash
cd /Users/arafatetoure/Documents/SKALLE/skalle
npx prisma db push
```

Cette commande va :
- Créer toutes les tables dans Supabase
- Créer les relations entre les tables
- Configurer les index

### 6. Vérifier la connexion

```bash
npx prisma studio
```

Cela ouvrira Prisma Studio dans votre navigateur où vous pourrez voir et gérer vos données.

## 🔒 Sécurité Supabase

### Row Level Security (RLS)

Par défaut, Supabase active le RLS sur toutes les tables. Pour ce projet utilisant NextAuth, vous pouvez :

**Option A : Désactiver RLS** (plus simple pour commencer)
```sql
-- Dans Supabase SQL Editor
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Post" DISABLE ROW LEVEL SECURITY;
-- ... etc pour toutes les tables
```

**Option B : Utiliser les Service Role Keys** (recommandé pour production)
- Gardez RLS activé
- Utilisez les clés `service_role` pour les opérations serveur (ne jamais exposer côté client)

## 📊 Vérifier que tout fonctionne

Après `npx prisma db push`, testez :

1. Démarrez le serveur : `npm run dev`
2. Essayez de vous inscrire sur `/register`
3. Si ça fonctionne, votre configuration est correcte !

## 🆘 Dépannage

### Erreur : "Password authentication failed"
- Vérifiez que le mot de passe dans `DATABASE_URL` correspond à celui créé dans Supabase
- Le mot de passe doit être encodé en URL si il contient des caractères spéciaux

### Erreur : "Connection timeout"
- Vérifiez que vous utilisez le bon port (6543 pour Pooler, 5432 pour Direct)
- Vérifiez que votre IP n'est pas bloquée dans les settings Supabase

### Erreur : "Table already exists"
- Exécutez `npx prisma migrate reset` pour réinitialiser (⚠️ supprime toutes les données)

## 📝 Notes importantes

- **Ne commitez JAMAIS votre `.env`** dans Git
- Gardez votre mot de passe Supabase en sécurité
- Le plan gratuit Supabase inclut 500 MB de stockage et 2 GB de bande passante par mois

## 🔗 Ressources

- [Documentation Supabase](https://supabase.com/docs)
- [Documentation Prisma avec Supabase](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-supabase)
