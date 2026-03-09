# ⚡ Quick Start - Configuration Supabase en 5 minutes

## 🎯 Objectif
Configurer Supabase et migrer le schéma Prisma pour Skalle.

---

## 📋 Checklist Rapide

### 1️⃣ Créer le projet Supabase (2 min)
- [ ] Aller sur https://supabase.com
- [ ] Créer un nouveau projet : `skalle-production`
- [ ] **NOTER LE MOT DE PASSE** de la base de données
- [ ] Attendre 2-3 minutes que le projet soit prêt

### 2️⃣ Récupérer l'URL de connexion (1 min)
- [ ] Aller dans **Settings** → **Database**
- [ ] Copier la **Connection string** (format URI)
- [ ] Remplacer `[YOUR-PASSWORD]` par le mot de passe noté

### 3️⃣ Configurer `.env` (1 min)
```bash
# Dans le dossier skalle, créer/modifier .env
DATABASE_URL="postgresql://postgres:VOTRE_MOT_DE_PASSE@db.xxxxx.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
```

### 4️⃣ Migrer le schéma (1 min)
```bash
# Générer le client Prisma
npm run db:generate

# Appliquer les migrations
npm run db:migrate

# (Optionnel) Ouvrir Prisma Studio pour vérifier
npm run db:studio
```

### 5️⃣ Tester la connexion (30 sec)
```bash
npm run db:test
```

✅ **Si vous voyez "🎉 Tous les tests sont passés!", c'est bon !**

---

## 🐛 Problèmes Courants

### Erreur P1010 (Database access denied)
**Solution**: Vérifier que le mot de passe dans `DATABASE_URL` est correct.

### Erreur "relation does not exist"
**Solution**: Relancer `npm run db:migrate`

### Erreur de connexion timeout
**Solution**: 
1. Vérifier que le projet Supabase est actif (pas suspendu)
2. Essayer avec `DATABASE_URL_DIRECT` pour les migrations

---

## 📖 Documentation Complète

Voir `SUPABASE_SETUP.md` pour le guide détaillé.

---

## ✨ Prochaines Étapes

Une fois Supabase configuré :
1. ✅ Test de connexion réussi
2. → Tester le flux d'inscription (`/register`)
3. → Tester la génération d'un article SEO
4. → Configurer les autres APIs (OpenAI, Serper, etc.)

**C'est parti ! 🚀**
