# 🧪 ÉTAPE 2 : Test du Flux Complet

## ✅ Objectifs de Test

1. **Inscription** - Créer un compte utilisateur
2. **Connexion** - Se connecter avec le compte créé
3. **Création Workspace** - Vérifier la création automatique du workspace
4. **Système de Crédits** - Vérifier l'initialisation des crédits
5. **Dashboard** - Accéder au dashboard après connexion

---

## 📋 Checklist de Test

### Test 1 : Inscription ✅
- [ ] Ouvrir http://localhost:3000/register
- [ ] Remplir le formulaire :
  - Nom : "Test User"
  - Email : "test@example.com"
  - Mot de passe : "test123456"
- [ ] Soumettre le formulaire
- [ ] Vérifier redirection vers `/login?registered=true`

**Vérification dans la base :**
```bash
npm run db:studio
# Vérifier que :
# - Un User est créé avec email "test@example.com"
# - Un Workspace "Mon Workspace" est créé pour cet utilisateur
# - Les crédits sont initialisés à 100 (plan FREE)
```

### Test 2 : Connexion ✅
- [ ] Ouvrir http://localhost:3000/login
- [ ] Entrer les identifiants :
  - Email : "test@example.com"
  - Mot de passe : "test123456"
- [ ] Cliquer sur "Se connecter"
- [ ] Vérifier redirection vers `/dashboard`

### Test 3 : Vérification Dashboard ✅
- [ ] Vérifier que la sidebar s'affiche
- [ ] Vérifier que le header avec le profil utilisateur s'affiche
- [ ] Vérifier que les crédits sont visibles (100 crédits)
- [ ] Vérifier que le workspace "Mon Workspace" est accessible

### Test 4 : Vérification Base de Données ✅
```bash
# Ouvrir Prisma Studio
npm run db:studio
```

**Vérifications :**
- [ ] Table `User` : 1 utilisateur créé
- [ ] Table `Workspace` : 1 workspace créé, lié à l'utilisateur
- [ ] User.credits = 100
- [ ] User.plan = "FREE"

### Test 5 : Navigation dans l'App ✅
- [ ] Cliquer sur "Agents IA" → Vérifier la page
- [ ] Cliquer sur "Discovery" → Vérifier la page
- [ ] Cliquer sur "SEO Factory" → Vérifier la page
- [ ] Cliquer sur "Autopilot" → Vérifier la page (peut nécessiter plan Business)
- [ ] Cliquer sur "Paramètres" → Vérifier la page

---

## 🐛 Problèmes Potentiels

### Erreur "MissingSecret"
**Solution** : Vérifier que `NEXTAUTH_SECRET` est défini dans `.env`

### Erreur de connexion à la base
**Solution** : Vérifier que `DATABASE_URL` est correct dans `.env`

### Page blanche après connexion
**Solution** : Vérifier les logs du serveur, peut-être une erreur dans le middleware

### Workspace non créé
**Solution** : Vérifier les logs, peut-être une erreur dans la route `/api/auth/register`

---

## 📊 Résultat Attendu

✅ **Inscription réussie**
- Utilisateur créé dans la base
- Workspace créé automatiquement
- Redirection vers `/login`

✅ **Connexion réussie**
- Session créée
- Redirection vers `/dashboard`
- Sidebar et header visibles

✅ **Dashboard accessible**
- Toutes les pages accessibles
- Crédits affichés (100)
- Workspace visible

---

## 🚀 Commandes Utiles

```bash
# Lancer le serveur de développement
npm run dev

# Ouvrir Prisma Studio (dans un autre terminal)
npm run db:studio

# Vérifier les logs en temps réel
# Les logs s'affichent dans le terminal où npm run dev est lancé
```

---

**Une fois tous les tests validés, passez à l'ÉTAPE 3 : Configurer les APIs externes !** 🎉
