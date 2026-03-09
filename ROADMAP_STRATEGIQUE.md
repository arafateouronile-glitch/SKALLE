# 🚀 SKALLE - Roadmap Stratégique pour Dominer le Marché

## 📊 Analyse de l'État Actuel

### ✅ Ce qui existe
- Architecture agentique avec 4 agents (SEO, Discovery, Social, Prospection)
- Authentification NextAuth.js
- Schéma de données Prisma complet
- Interface dashboard de base
- Intégration LangChain/LangGraph
- Génération de contenu SEO
- Repurposing social media

### ❌ Ce qui manque (CRITIQUE)
- Pas de vraie connexion base de données testée
- Pas de système de crédits fonctionnel
- Pas de publication automatique CMS opérationnelle
- Pas de tracking de performance
- Pas d'onboarding utilisateur
- Pas de notifications temps réel
- Pas de système de billing/abonnement

---

## 🎯 PHASE 1: FONDATIONS SOLIDES (Semaines 1-2)
*Objectif: Produit fonctionnel et stable*

### 1.1 🔧 Corrections Critiques

#### Base de données & Auth
- [ ] Configurer Supabase/PostgreSQL en production
- [ ] Tester le flux complet d'inscription/connexion
- [ ] Implémenter la récupération de mot de passe
- [ ] Ajouter l'authentification Google/GitHub OAuth
- [ ] Vérification d'email

#### Système de Crédits
- [ ] Décompte réel des crédits à chaque action
- [ ] Alerte quand crédits faibles
- [ ] Blocage des actions si crédits = 0
- [ ] Affichage temps réel dans la sidebar

#### Gestion d'erreurs
- [ ] Error boundaries React pour toutes les pages
- [ ] Retry automatique sur échecs API
- [ ] Logging centralisé (Sentry ou LogRocket)
- [ ] Messages d'erreur user-friendly en français

### 1.2 🎨 UX Essentielles

#### Onboarding
```
Flux:
1. Inscription → 2. Créer Workspace → 3. Connecter domaine 
→ 4. Analyser Brand Voice → 5. Premier article généré
```
- [ ] Wizard d'onboarding en 5 étapes
- [ ] Vidéo de démo intégrée
- [ ] Templates de démarrage rapide
- [ ] Checklist de progression

#### Navigation & Feedback
- [ ] Loading states sur TOUTES les actions
- [ ] Toasts de confirmation/erreur
- [ ] Breadcrumbs de navigation
- [ ] Recherche globale (Cmd+K)

---

## 🔥 PHASE 2: DIFFÉRENCIATEURS MARCHÉ (Semaines 3-4)
*Objectif: Fonctionnalités uniques qui tuent la concurrence*

### 2.1 🤖 Agent Autopilote (KILLER FEATURE)

**Concept**: L'agent travaille 24/7 sans intervention humaine

```typescript
// Nouveau modèle Prisma
model AutopilotConfig {
  id              String   @id @default(cuid())
  workspaceId     String   @unique
  isActive        Boolean  @default(false)
  
  // SEO Autopilot
  seoEnabled      Boolean  @default(false)
  seoFrequency    String   // "daily", "weekly", "biweekly"
  seoKeywords     String[] // Keywords à cibler automatiquement
  seoMinArticles  Int      @default(5) // par période
  
  // Social Autopilot
  socialEnabled   Boolean  @default(false)
  socialPlatforms String[] // ["X", "LINKEDIN", "TIKTOK"]
  socialFrequency String   // "daily", "bidaily"
  
  // Discovery Autopilot
  discoveryEnabled    Boolean  @default(false)
  competitorUrls      String[] // Concurrents à surveiller
  alertOnOpportunity  Boolean  @default(true)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Fonctionnalités:**
- [ ] Dashboard "Autopilot Control Center"
- [ ] Planification automatique via CRON jobs (Inngest)
- [ ] Notifications email des actions réalisées
- [ ] Rapport hebdomadaire automatique
- [ ] Pause/Reprendre en 1 clic

### 2.2 📊 Analytics & Intelligence

**Nouveau modèle:**
```typescript
model Analytics {
  id            String   @id @default(cuid())
  workspaceId   String
  date          DateTime
  
  // SEO Metrics
  articlesPublished  Int
  estimatedTraffic   Int
  keywordsRanking    Json // {keyword: position}
  
  // Social Metrics
  postsPublished     Int
  totalReach         Int
  engagementRate     Float
  
  // Prospection Metrics
  prospectsContacted Int
  responsesReceived  Int
  meetingsBooked     Int
  
  createdAt     DateTime @default(now())
}
```

**Fonctionnalités:**
- [ ] Dashboard analytics avec graphiques (Recharts)
- [ ] Tracking des positions Google (via Serper)
- [ ] Estimation du trafic organique
- [ ] ROI calculator (coût IA vs valeur générée)
- [ ] Comparaison période vs période
- [ ] Export PDF des rapports

### 2.3 🎙️ Voice-to-Content (DIFFÉRENCIATEUR UNIQUE)

**Concept**: Parler → L'agent génère tout le contenu

- [ ] Intégration Whisper API (OpenAI) pour transcription
- [ ] "Dictez votre idée, on crée l'article"
- [ ] Enregistrement audio dans le browser
- [ ] Conversion vocale → Brief → Article SEO
- [ ] Support des notes vocales (upload MP3/M4A)

### 2.4 🧠 Mémoire & Contexte Intelligent

**Concept**: L'agent "connaît" votre marque

```typescript
model BrandMemory {
  id            String   @id @default(cuid())
  workspaceId   String
  category      String   // "terminology", "competitors", "achievements", "products"
  key           String
  value         String   @db.Text
  importance    Int      @default(5) // 1-10
  createdAt     DateTime @default(now())
}
```

- [ ] Base de connaissances par workspace
- [ ] L'agent cite vos produits/services automatiquement
- [ ] Intègre vos différenciateurs dans chaque contenu
- [ ] Évite les concurrents mentionnés comme "à éviter"
- [ ] Apprentissage des préférences de l'utilisateur

---

## 💎 PHASE 3: FONCTIONNALITÉS PREMIUM (Semaines 5-6)
*Objectif: Justifier le pricing élevé*

### 3.1 🔗 Intégrations Natives

#### CMS (Publication directe)
- [ ] WordPress (REST API) ✓ Base existe
- [ ] Shopify (Storefront API)
- [ ] Webflow (CMS API)
- [ ] Ghost
- [ ] Notion (pour drafts)

#### Social Media (Publication directe)
- [ ] LinkedIn API (posts natifs)
- [ ] X/Twitter API
- [ ] Buffer/Hootsuite (fallback)
- [ ] Instagram via Facebook Graph API
- [ ] TikTok Business API

#### CRM & Prospection
- [ ] HubSpot (sync prospects)
- [ ] Pipedrive
- [ ] Salesforce
- [ ] Lemlist (séquences email)
- [ ] Apollo.io (enrichissement prospects)

#### Analytics
- [ ] Google Analytics 4 (tracking)
- [ ] Google Search Console (positions)
- [ ] Plausible/Fathom (alternative)

### 3.2 📧 Email Marketing Automation

**Nouveau module:**
- [ ] Création de séquences email avec l'IA
- [ ] Templates de nurturing
- [ ] A/B testing automatique des objets
- [ ] Intégration Mailchimp/Brevo/Resend

### 3.3 🎨 Studio Créatif Avancé

#### Images
- [ ] Génération avec Midjourney/DALL-E 3/Flux
- [ ] Templates de visuels (bannières, posts, ads)
- [ ] Brand kit (couleurs, fonts, logo)
- [ ] Éditeur d'images in-app (Tldraw ou Fabric.js)

#### Vidéo (PREMIUM)
- [ ] Script → Vidéo avec avatars AI (HeyGen/Synthesia)
- [ ] Clips TikTok automatiques
- [ ] Sous-titres générés automatiquement

### 3.4 🏆 A/B Testing & Optimisation

- [ ] Tester plusieurs titres pour un article
- [ ] Tester plusieurs hooks pour posts sociaux
- [ ] Sélection automatique du meilleur performer
- [ ] Learning continu des préférences audience

### 3.10 📸 Module : IG Audience & Hashtag Extractor (Instagram Prospector)

**Competitor Hijacking** : Extraction des followers d'un compte cible (ex: les followers de ton plus gros concurrent).

**Hashtag Interaction** : Extraction des profils ayant liké ou commenté les publications les plus récentes ou les plus populaires d'un #hashtag spécifique.

**Filtrage Intelligent** : Élimination automatique des comptes "bots" ou inactifs (ceux sans photo de profil ou avec 0 publication).

**Workflow** :
- Script JS à lancer sur IG (liste abonnés ou page hashtag) → extraction des handles
- Import vers l'API → stockage dans SocialInteraction (platform: INSTAGRAM)
- IA analyse le contexte hashtag / concurrent et génère des DM "low-friction"
- Quotas warm-up : 20 suggestions DM/jour max au début pour éviter le flagging
- Méthode des 3 étapes : Question/Compliment → Valeur → Lien (jamais de lien au 1er message)

---

## 🔒 PHASE 4: MONÉTISATION & SCALE (Semaines 7-8)
*Objectif: Revenus récurrents*

### 4.1 💳 Système de Billing

#### Stripe Integration
- [ ] Checkout pour upgrades
- [ ] Gestion des abonnements
- [ ] Portail client self-service
- [ ] Webhooks pour sync statut

#### Plans
```
FREE (0€/mois)
- 100 crédits/mois
- 1 workspace
- Génération basique
- Pas d'autopilot

STARTER (49€/mois)
- 500 crédits/mois
- 3 workspaces
- Tous les agents
- Autopilot limité (5 articles/semaine)
- Support email

BUSINESS (149€/mois)
- 2000 crédits/mois
- 10 workspaces
- Autopilot illimité
- Intégrations CMS
- Analytics avancés
- Support prioritaire

AGENCY (399€/mois)
- 10000 crédits/mois
- Workspaces illimités
- White-label (votre logo)
- API access
- Sous-comptes clients
- Account manager dédié

ENTERPRISE (Sur devis)
- Crédits illimités
- Déploiement on-premise possible
- SLA garanti
- Formation équipe
```

### 4.2 📊 Usage-Based Pricing (Additionnel)

- [ ] Achats de crédits à la carte
- [ ] Packs "Boost" pour campagnes ponctuelles
- [ ] Crédits rollover (non-utilisés reportés)

### 4.3 🏢 Features Agency/Enterprise

- [ ] Multi-tenant (clients séparés)
- [ ] White-label complet
- [ ] API publique documentée
- [ ] Webhooks pour intégrations custom
- [ ] SSO (SAML/OIDC)
- [ ] Audit logs
- [ ] Rôles & permissions avancés

---

## 🛡️ PHASE 5: TRUST & RELIABILITY (Continu)
*Objectif: Confiance utilisateur*

### 5.1 Sécurité

- [ ] Chiffrement des données sensibles
- [ ] Conformité RGPD (export/suppression données)
- [ ] Rate limiting sur toutes les routes
- [ ] Protection CSRF/XSS
- [ ] Audit de sécurité externe

### 5.2 Performance

- [ ] Cache Redis pour requêtes fréquentes
- [ ] CDN pour assets (Vercel Edge)
- [ ] Optimisation images (next/image)
- [ ] Lazy loading composants lourds
- [ ] Service Workers pour offline

### 5.3 Monitoring

- [ ] Uptime monitoring (BetterStack)
- [ ] APM (Application Performance)
- [ ] Alertes Slack/Discord sur erreurs
- [ ] Métriques business temps réel

---

## 🎯 QUICK WINS À IMPLÉMENTER MAINTENANT

### Cette semaine (Impact immédiat)

1. **Système de crédits fonctionnel**
   - Décompte à chaque appel AI
   - Affichage temps réel

2. **Notifications temps réel**
   - Toast quand agent termine
   - Email récap quotidien

3. **Export des contenus**
   - Bouton "Télécharger en Markdown"
   - Copier en 1 clic

4. **Historique des générations**
   - Liste de tous les contenus créés
   - Filtres par date/type/statut

5. **Mode "Quick Generate"**
   - 1 input → 1 article en 30 secondes
   - Parfait pour les démos

### Semaine prochaine

6. **Connexion réseaux sociaux**
   - OAuth LinkedIn
   - Publication directe

7. **Calendrier éditorial fonctionnel**
   - Drag & drop
   - Planification

8. **Templates de contenu**
   - 10 templates SEO pré-faits
   - 5 templates posts sociaux

---

## 📈 MÉTRIQUES DE SUCCÈS

### North Star Metrics
- **MRR** (Monthly Recurring Revenue)
- **Articles publiés/mois** (usage)
- **DAU/MAU ratio** (engagement)

### Metrics Secondaires
- Temps moyen de génération d'article
- Taux de conversion Free → Paid
- Churn rate
- NPS (Net Promoter Score)
- Crédits consommés/utilisateur

---

## 🏆 POSITIONNEMENT MARCHÉ

### Concurrents Directs
- Jasper AI (texte générique, pas d'agents)
- Copy.ai (pas de SEO profond)
- Surfer SEO (pas de génération complète)
- WriteSonic (pas d'autopilot)

### Notre Différenciation
1. **Agents Autonomes** - Ils travaillent, vous dormez
2. **SEO-First** - Optimisé pour le ranking, pas juste le texte
3. **Tout-en-un** - SEO + Social + Prospection + Analytics
4. **Mémoire de marque** - Contenu toujours aligné
5. **Voice-to-Content** - Innovation unique

### Tagline
> "Skalle - Votre équipe marketing IA qui travaille 24/7"

---

## 🚀 PROCHAINES ÉTAPES IMMÉDIATES

1. **Fixer la connexion base de données** (Supabase)
2. **Implémenter le système de crédits**
3. **Ajouter le mode Autopilot de base**
4. **Créer la landing page de conversion**
5. **Configurer Stripe pour les paiements**

---

*Document créé le: Janvier 2026*
*Dernière mise à jour: À maintenir régulièrement*
