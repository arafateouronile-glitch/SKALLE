# Skalle - Marketing OS Agentique

> Transformez n'importe quel site web en une machine de guerre marketing automatisée.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Prisma](https://img.shields.io/badge/Prisma-5-teal)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-cyan)

## 🚀 Fonctionnalités

### 📊 Dashboard
- KPIs en temps réel (articles générés, prospects, crédits)
- Vue d'ensemble de l'activité marketing
- Guide de démarrage interactif

### 🔍 Discovery Module
- Analyse des concurrents via Serper.dev
- Détection des meilleures pages SEO
- Opportunités de mots-clés avec scores de difficulté

### 📝 SEO Factory
- **Audit SEO instantané** : Score 0-100 avec recommandations
- **Génération Bulk** : Jusqu'à 300 articles SEO en un clic
- Intégration sources réelles + génération d'images

### 📅 Social & Calendrier
- **Content Repurposing** : Article → Thread X, Post LinkedIn, Script TikTok
- Calendrier éditorial visuel
- Planification des publications

### 👥 Prospection LinkedIn
- Gestion des prospects avec pipeline Kanban
- Génération de séquences de messages personnalisées (Claude 3.5)
- Suivi des relances

### 🖼️ Générateur d'Images
- Templates prédéfinis (Header blog, Post social, Banner LinkedIn)
- Styles personnalisables (Minimal, Corporate, Tech, Creative)
- Intégration Banana.dev

### 🔌 Intégrations CMS
- WordPress REST API
- Shopify (prévu)
- Publication automatique avec images

### 💳 Système de Crédits
- Plans : Free, Business, Agency, Scale
- Tracking de l'usage API
- Alertes de consommation

## 🛠️ Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 16 (App Router) |
| Langage | TypeScript |
| Base de données | PostgreSQL + Prisma |
| Auth | NextAuth.js v5 |
| UI | Shadcn UI + Tailwind CSS 4 |
| IA Texte | LangChain + OpenAI GPT-4o + Claude 3.5 |
| IA Images | Banana.dev |
| Recherche | Serper.dev |
| Jobs | Inngest |

## 📁 Structure du Projet

```
src/
├── app/
│   ├── (auth)/              # Pages login/register
│   ├── (dashboard)/         # Routes protégées
│   │   └── dashboard/
│   │       ├── analytics/
│   │       ├── discovery/
│   │       ├── images/
│   │       ├── integrations/
│   │       ├── prospection/
│   │       ├── seo-factory/
│   │       ├── settings/
│   │       └── social/
│   └── api/
│       ├── auth/
│       └── inngest/
├── actions/                 # Server Actions
│   ├── brand.ts
│   ├── cms.ts
│   ├── discovery.ts
│   ├── images.ts
│   ├── prospects.ts
│   ├── seo.ts
│   └── social.ts
├── components/
│   ├── modules/             # Composants métier
│   └── ui/                  # Shadcn UI
├── inngest/                 # Background jobs
│   ├── client.ts
│   └── functions/
├── lib/
│   ├── ai/                  # Services IA
│   │   ├── banana.ts
│   │   ├── langchain.ts
│   │   └── serper.ts
│   ├── cms/
│   │   └── wordpress.ts
│   ├── auth.ts
│   ├── prisma.ts
│   └── utils.ts
└── types/
```

## 🚀 Installation

### 1. Cloner et installer

```bash
git clone <repo>
cd skalle
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Remplir les clés API :
- `DATABASE_URL` : URL PostgreSQL
- `NEXTAUTH_SECRET` : Clé secrète (générer avec `openssl rand -base64 32`)
- `OPENAI_API_KEY` : Clé API OpenAI
- `ANTHROPIC_API_KEY` : Clé API Anthropic
- `SERPER_API_KEY` : Clé API Serper.dev
- `BANANA_API_KEY` : Clé API Banana.dev
- **Ad-Intelligence (Meta Ad Library)** : `META_FB_ACCESS_TOKEN` (token Graph API avec accès ads_archive) et optionnel `META_AD_LIBRARY_COUNTRY=FR` (ou US, GB, ALL). Sans token, les annonces Meta sont en mode démo (données fictives).

### 3. Initialiser la base de données

```bash
npx prisma db push
npx prisma generate
```

### 4. Lancer le développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

**Déploiement (Stripe, env, DB, webhook)** : voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).  
**Analyse complète de l’app (architecture, fonctionnalités, données)** : voir [docs/ANALYSE-APPLICATION.md](docs/ANALYSE-APPLICATION.md).

## 📊 Budget API (Plan Business - 300 articles)

| Service | Coût unitaire | Usage | Total |
|---------|---------------|-------|-------|
| GPT-4o mini | 0.01€/article | 300 | 3€ |
| Serper.dev | 0.01€/recherche | 600 | 6€ |
| Banana.dev | 0.15€/image | 300 | 45€ |
| **Total** | | | **~54€** |

Marge sur plan à 999€ : **~945€**

## 🔐 Sécurité

- Authentification JWT via NextAuth.js
- Protection des routes via middleware
- Hashing bcrypt pour les mots de passe
- Clés API stockées côté serveur uniquement

## 📜 Licence

Propriétaire - Tous droits réservés

---

Développé avec ❤️ et beaucoup de ☕
# SKALLE
