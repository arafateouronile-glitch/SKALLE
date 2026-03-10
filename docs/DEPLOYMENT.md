# Checklist déploiement SKALLE

Guide pour mettre en production ou configurer un environnement SKALLE (variables d’env, Stripe, base de données, optionnel).

---

## 1. Variables d’environnement

Créer `.env.local` (ou `.env` en prod) à la racine du projet.

### Obligatoires (core)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | URL PostgreSQL (Prisma) | `postgresql://user:pass@host:5432/db` |
| `NEXTAUTH_URL` | URL de l’app (front) | `https://app.skalle.io` ou `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Secret pour les sessions NextAuth | Générer avec `openssl rand -base64 32` |
| `OPENAI_API_KEY` | Clé API OpenAI (GPT, Whisper) | `sk-...` |

### Auth (au moins un provider)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth GitHub |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | OAuth Facebook |

### Stripe (abonnements + portail)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (sk_live_... ou sk_test_...) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret du webhook (whsec_...) |
| `STRIPE_PRICE_BUSINESS` | Price ID du plan Business (prix_ mensuel) |
| `STRIPE_PRICE_AGENCY` | Price ID du plan Agency |
| `STRIPE_PRICE_SCALE` | Price ID du plan Scale |

### Optionnel (fonctionnalités)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude (agents, séquences) |
| `SERPER_API_KEY` | Recherche / SEO (Serper) |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | DataForSEO (intelligence SEO) |
| `NANO_BANANA_API_KEY` | Génération d’images (Nano Banana) |
| `SKALLE_ADMIN_EMAILS` | Liste d’emails admin (séparés par des virgules) pour accès admin |
| `PAGESPEED_API_KEY` | Audit technique SEO (Google PageSpeed) |
| `RESEND_API_KEY` ou `SENDGRID_API_KEY` | Emails (séquences, notifications) |
| `FROM_EMAIL` | Email expéditeur (ex. `Skalle <noreply@skalle.io>`) |
| `COMPANY_OFFER` | Phrase d’offre utilisée dans les séquences / agents |
| `DISCORD_ADMIN_WEBHOOK_URL` | Notifications admin Discord |
| `ADMIN_NOTIFY_EMAIL` | Email pour alertes admin |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` / `SMTP_FROM` | SMTP custom (notifications) |
| `META_FB_ACCESS_TOKEN` / `META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN` | Meta / Facebook (ads, webhooks) |
| `TIKTOK_AD_LIBRARY_URL` / `LINKEDIN_AD_LIBRARY_URL` / `PINTEREST_ADS_API_URL` | Bibliothèques pubs (Ad Intelligence) |
| `AD_SCRAPER_PROXY_URL` | Proxy pour scraping pubs |
| `APOLLO_API_KEY` / `HUNTER_API_KEY` / `CLAY_API_KEY` | Enrichissement prospection |
| `SERPAPI_API_KEY` | SerpAPI (signaux d’intention) |
| `OUTSCRAPER_API_KEY` ou `APIFY_API_KEY` | Local / maps (CSO) |
| `USE_OUTSCRAPER` | `true` pour privilégier Outscraper |
| `ENCRYPTION_KEY` | 64 caractères hex (32 bytes) pour chiffrement AES-256 des clés Outbound. Générer avec `openssl rand -hex 32` |
| `DIRECT_URL` | Uniquement si vous utilisez un pool (ex. PgBouncer) : URL PostgreSQL directe (port 5432) pour les migrations. En local, `DATABASE_URL` suffit. |

### Configurer les variables dans Vercel

1. **Ouvre ton projet** sur [vercel.com](https://vercel.com) → ton projet SKALLE.
2. **Settings** → **Environment Variables**.
3. **Ajoute chaque variable** : Name = nom de la variable, Value = la valeur (copie depuis ton `.env.local`).
4. Coche **Production** (et éventuellement Preview) pour chaque variable.
5. **Important** : après avoir tout ajouté, **redéploie** (Deployments → ⋮ sur le dernier déploiement → Redeploy) pour que les nouvelles variables soient prises en compte.

**Minimum pour que l’app tourne en prod :**

- `AUTH_SECRET` — même valeur qu’en local (Auth.js), ex. `openssl rand -base64 32`
- `AUTH_URL` ou `NEXTAUTH_URL` — **`https://skalle.vercel.app`** (ou ton domaine custom)
- `DATABASE_URL` — URL PostgreSQL (Supabase poolée, port 6543 si PgBouncer)
- `DIRECT_URL` — URL directe PostgreSQL (port 5432), requise si tu utilises le pool Supabase
- `ENCRYPTION_KEY` — 64 caractères hex (déjà en local)
- Au moins un provider d’auth : p.ex. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, ou credentials (voir `auth.config.ts`)

**Recommandé en plus :** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`. Stripe (voir section 2) si tu utilises les abonnements.

---

## 2. Stripe

### 2.1 Produits et prix

1. Stripe Dashboard → **Produits** → créer 3 produits (ex. « SKALLE Business », « SKALLE Agency », « SKALLE Scale »).
2. Pour chaque produit, créer un **prix** récurrent (mensuel ou annuel selon ton modèle).
3. Copier les **Price ID** (ex. `price_xxx`) dans :
   - `STRIPE_PRICE_BUSINESS`
   - `STRIPE_PRICE_AGENCY`
   - `STRIPE_PRICE_SCALE`

### 2.2 Webhook

1. Stripe Dashboard → **Développeurs** → **Webhooks** → **Ajouter un endpoint**.
2. URL : `https://votre-domaine.com/api/webhooks/stripe` (en prod) ou utiliser Stripe CLI en local.
3. Événements à sélectionner :
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
4. Copier le **Signing secret** (whsec_...) dans `STRIPE_WEBHOOK_SECRET`.

En local avec Stripe CLI :

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Utiliser le whsec_... affiché comme STRIPE_WEBHOOK_SECRET en local
```

---

## 3. Base de données (Prisma)

### 3.1 Générer le client

```bash
npx prisma generate
```

### 3.2 Appliquer le schéma

- **Nouvelle base / env propre :**  
  `npx prisma migrate deploy`  
  (ou `npx prisma db push` si vous ne tenez pas un historique de migrations.)

- **Développement avec migrations :**  
  `npx prisma migrate dev`

### 3.3 Vérifier

```bash
npx prisma studio
```

Ouvrir la base et vérifier que les tables (User, Workspace, etc.) et les champs récents (`onboardingStep`, `stripeCustomerId`, etc.) sont présents.

---

## 4. Lancer l’app

```bash
npm install
npx prisma generate
npm run dev
```

En prod, après `npm run build`, lancer le process Next (ex. `npm start` ou via la plateforme).

---

## 5. Optionnel

### Sentry (erreurs)

- Créer un projet sur sentry.io, récupérer le DSN.
- Ajouter `SENTRY_DSN` et, si utilisé, le SDK Sentry selon la doc Next.js.

### Inngest (jobs async)

- Si vous utilisez Inngest pour Content Factory / Agent Brain : configurer `INNGEST_*` selon la doc Inngest et le déployer (dev ou prod).

### Domaine / SSL

- Configurer le domaine sur votre hébergeur (Vercel, etc.).
- Mettre `NEXTAUTH_URL` et l’URL du webhook Stripe avec ce domaine.

---

## 6. Vérifications post-déploiement

- [ ] Connexion (Google / GitHub / etc.) fonctionne.
- [ ] Onboarding : un nouvel utilisateur est redirigé vers le wizard puis vers l’app.
- [ ] Paramètres : onglet abonnement, boutons « Gérer mon abonnement » (portail) et « Choisir » (checkout) ouvrent bien Stripe.
- [ ] Crédits : la sidebar affiche les crédits et le bandeau d’alerte si proche de 0 / épuisés.
- [ ] Une action payante (ex. audit SEO, génération d’article) débite bien les crédits et bloque à 0.

---

*Dernière mise à jour : février 2025*
