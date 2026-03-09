# Analyse complète de l’application SKALLE

Document de référence : architecture, fonctionnalités, données et recommandations.

---

## 1. Vision & positionnement

**SKALLE** est une plateforme **Marketing OS + Sales OS** (double positionnement CMO / CSO) qui vise à :

- **CMO (Chief Marketing Officer)** : automatiser et piloter le marketing (SEO, contenu, social, discovery, ads, images, autopilot).
- **CSO (Chief Sales Officer)** : piloter la vente (prospection, pipeline CRM, lead scoring, signaux d’intention, closing, réponses IA).

En pratique : un même produit avec **deux espaces** (Marketing OS et Sales OS), un **système de crédits** unifié, **Stripe** pour la monétisation, et un **onboarding** guidé.

---

## 2. Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 16 (App Router) |
| Langage | TypeScript 5 |
| Base de données | PostgreSQL + Prisma 5 |
| Auth | NextAuth.js v5 (Google, GitHub, Facebook, credentials) |
| UI | React 19, Shadcn UI (Radix), Tailwind CSS 4 |
| IA Texte | LangChain, OpenAI GPT-4o, Anthropic Claude |
| IA Images | Banana.dev, Nano Banana (SEO) |
| Recherche / SEO | Serper, DataForSEO |
| Paiements | Stripe (abonnements + portail client) |
| Jobs asynchrones | Inngest |
| Formulaires / validation | React Hook Form, Zod |

---

## 3. Architecture applicative

### 3.1 Routes & layouts

- **`(auth)`** : `/login`, `/register` — redirection vers `/marketing-os` si déjà connecté.
- **`(app)`** : layout commun avec vérification de session et **redirection onboarding** (si `onboardingStep` 1–4 → `/onboarding`).
- **`(app)/(cmo-workspace)`** : Marketing OS — sidebar CMO, **CreditsProvider**, pages sous `/marketing-os/*`.
- **`(app)/(cso-workspace)`** : Sales OS — sidebar CSO, pages sous `/sales-os/*`.
- **`(app)/onboarding`** : wizard 4 étapes (domaine → brand voice → premier article → fin).
- **`(landing)`** : pages produit `/cmo`, `/cso`.

### 3.2 Middleware

- Protection des routes `/dashboard`, `/marketing-os`, `/sales-os` (redirection vers `/login` si non connecté).
- Redirection des utilisateurs connectés depuis `/login` et `/register` vers `/marketing-os`.
- Header `x-pathname` pour que le layout app puisse faire la redirection onboarding sans boucle.

### 3.3 API Routes (principales)

| Route | Rôle |
|-------|------|
| `POST /api/auth/register` | Inscription |
| `GET/POST /api/auth/[...nextauth]` | NextAuth |
| `POST /api/voice/transcribe` | Whisper (transcription audio, 1 crédit, auth) |
| `POST /api/stripe/checkout-subscription` | Création session Stripe abonnement (plan BUSINESS/AGENCY/SCALE) |
| `POST /api/stripe/portal` | Session Stripe Billing Portal |
| `POST /api/webhooks/stripe` | Webhook Stripe (subscription, invoice.paid → sync plan + crédits) |
| `POST /api/webhooks/meta` | Webhook Meta (engagement, messaging) |
| `POST /api/inngest` | Inngest (jobs) |
| `POST /api/seo/audit`, `.../generate/bulk`, `.../articles`, etc. | SEO (legacy / complément server actions) |
| `POST /api/seo/intelligence/*` | SEO Intelligence (keywords, competitor, content-gap, domain-authority, brief) |
| `POST /api/prospects/import` | Import prospects |
| `POST /api/facebook-groups/import-members` | Import membres groupes Facebook |

La majeure partie de la logique métier passe par **Server Actions** (`src/actions/*`) plutôt que par des API routes REST.

---

## 4. Modèle de données (résumé)

### 4.1 Cœur

- **User** : id, email, name, image, plan (FREE|BUSINESS|AGENCY|SCALE), **credits**, **stripeCustomerId**, relations NextAuth (Account, Session).
- **Workspace** : nom, **domainUrl**, **onboardingStep** (0=terminé, 1–4=étapes), **brandVoice** (JSON), **hasCmoAccess** / **hasCsoAccess**, userId. Lie tout le reste (posts, prospects, audits, etc.).

### 4.2 Contenu & SEO

- **Post** : type (SEO_ARTICLE, LINKEDIN, X, INSTAGRAM, …), titre, contenu, meta SEO, outline, scores (readability, seoScore), status, scheduledAt, publishedAt, workspaceId, batchJobId, contentPlanId.
- **SEOAudit** : url, globalScore, metadata, targetKeywords, competitors, actionPlan (+ champs legacy).
- **KeywordResearch** : keyword, difficulty, volume, cpc, kd, trend, topCompetitors, relatedKeywords, paaQuestions, searchIntent.
- **SEOIntelligenceCache** : cache pour DataForSEO (type, queryKey, data, expiresAt).
- **BatchJob** : jobs de génération bulk (totalItems, completed, failed, status).

### 4.3 Prospection & CRM

- **Prospect** : name, linkedInUrl, company, email, status (NEW → CONVERTED/REJECTED), **score**, **sentiment**, **temperature**, **source** (LINKEDIN, SEO_INBOUND, JOB_BOARD_SIGNAL, LOCAL_MAPS…), value, interactions, aiNotes.
- **ProspectInteraction** : canal, type (SENT/RECEIVED), content (historique multi-canal).
- **ProspectAiNote** : notes / analyses IA.
- **OutreachSequence** / **SequenceStep** : séquences multi-canal (LINKEDIN, EMAIL, PHONE, SMS), statuts d’envoi, délais.
- **LeadEnrichment** : Apollo, Clay, Hunter, etc.
- **ProspectList** / **ProspectListEntry** : listes de prospects.
- **EmailCampaign** / **SmtpConfig** : campagnes email, config SMTP, limites.
- **ReplyDetection** : détection des réponses (IMAP) liée aux steps.
- **ObjectionBank** : réponses types aux objections (CSO).
- **QuickPaymentLink** : liens de paiement Stripe (one-click checkout).

### 4.4 Social & Ads

- **ScrapedAd** : annonces scrapées (META, TIKTOK, LINKEDIN, PINTEREST), analyse IA (hook, framework, visualAnalysis, efficiencyScore).
- **CreativeBrief** : briefs générés à partir d’une annonce (remix).
- **ContentPlan** : plans Content Factory (mois/année, vision, niche, objectives, conceptsData, statut génération).
- **SocialInteraction** : likes, commentaires, follows, membres de groupes (Instagram/Facebook), suggestedDMs, statut DM (PENDING_APPROVAL, SENT…).
- **FacebookGroup** : groupes Facebook connectés.
- **MetaSocialAccount** : Page Facebook + compte Instagram Business, tokens, webhook.

### 4.5 Autopilot & Agent

- **AutopilotConfig** : SEO, Social, Discovery, Prospection (fréquences, paramètres).
- **AutopilotLog** : logs d’exécution.
- **AgentDecision** : décisions de l’agent (reasoning, actionType, actionData, status, linkedPostId).

### 4.6 Infra & config

- **APIUsage** : traçabilité des crédits (service, operation, credits, workspaceId).
- **CMSConfig** : WordPress (ou futur Shopify).
- **EmailDeliverabilityConfig** : domaine, SPF/DKIM/DMARC, warmup, limites.
- **LeadSearchCriteria** : critères de recherche de leads.
- **ExtensionToken** : tokens pour extension Chrome (import).
- **VerificationToken** : NextAuth.

---

## 5. Marketing OS (CMO) — Fonctionnalités détaillées

### 5.1 Dashboard (`/marketing-os`)

- KPIs : articles, prospects, crédits.
- Vue d’ensemble de l’activité.

### 5.2 Onboarding (`/onboarding`)

- 4 étapes : (1) nom + domaine, (2) analyse brand voice, (3) premier article SEO, (4) fin (activation CMO/CSO).
- Utilise `getOnboardingState`, `setOnboardingDomain`, `runOnboardingBrandAnalysis`, `generateOnboardingFirstArticle`, `completeOnboarding`.

### 5.3 Discovery (`/marketing-os/discovery`)

- **Onglet Analyse concurrentielle** : saisie domaine → analyse (Serper / DataForSEO) : top pages, mots-clés, opportunités. Coût : **competitor_analysis** (4 crédits). Bannière + blocage à 0 crédit.
- **Onglet Ad Intelligence** : recherche d’annonces (Meta, TikTok, LinkedIn, Pinterest), analyse IA (Vision) et remix créatif. Coûts : **ad_analysis** (20), **ad_remix** (15). Bannière + désactivation analyse/remix à 0 crédit.

### 5.4 Keywords (`/marketing-os/keywords`)

- Recherche mot-clé type Semrush/Ubersuggest : volume, KD, CPC, tendances, PAA, SERP, intention.
- Appels : `getKeywordIntelligence`, `researchKeyword`, `generateContentBrief`. Crédits : keyword_research, seo_keyword_intelligence, seo_content_brief. Bannière + boutons désactivés à 0.

### 5.5 Keyword Analyzer (`/marketing-os/keyword-analyzer`)

- Analyse, opportunités, concurrent, comparaison de mots-clés (actions `keyword-analyzer`). Crédits : keyword_research, competitor_analysis. Bannière + 4 actions désactivées à 0.

### 5.6 SEO Factory (`/marketing-os/seo-factory`)

- **Audit SEO** : URL → score global, métadonnées, mots-clés cibles, concurrents, plan d’action. Coût : **seo_audit** (2).
- **Article unique** : mot-clé → génération + preview ; bouton **Dicter** (Voice-to-Content, 1 crédit). Coût : **seo_article_single** (8).
- **Génération bulk** : liste de mots-clés → batch job (Inngest). Coûts par article (short/medium/long).
- **Liste d’articles** : filtres, pagination, export, suppression, duplication.
- **SEO Intelligence** : URL → rapport complet (scraping, concurrents, stratégie). Coût : **seo_intelligence** (10).
- **Topic clusters** : mot-clé pilier → cluster de contenus.
- Bannière crédits épuisés + tous les boutons d’action désactivés à 0.

### 5.7 Content Factory (`/marketing-os/social/factory`)

- **Stratégie** : formulaire vision, niche, objectifs → **Initialiser la stratégie** (brand persona, 5 crédits) et **Générer 30 posts** (lance Inngest : strategy + concepts + posts + images). Coûts : social_factory_strategy, social_factory_concepts, social_factory_post, social_factory_image. Bannière + boutons désactivés à 0.
- Onglets : Propositions, Calendrier, Repurposing, Campagnes.

### 5.8 Images (`/marketing-os/images`)

- Génération d’images IA (templates, style, dimensions). Action `generateAIImage` (débit manuel 1 crédit dans l’action). Bannière + bouton Générer désactivé à 0.

### 5.9 Analytics (`/marketing-os/analytics`)

- Vue marketing + **vue pipeline Sales** : cartes (prospects pipeline, en discussion, valeur pipeline, win rate), tunnel par étape, lien vers `/sales-os/analytics`.

### 5.10 Paramètres (`/marketing-os/settings`)

- Données utilisateur/workspace, **crédits et plan** (affichage + lien Stripe Billing Portal, boutons **Choisir** vers checkout par plan).

### 5.11 Autres pages CMO

- **Autopilot** (`/marketing-os/autopilot`) : configuration SEO, Social, Discovery, Prospection.
- **Agents** (`/marketing-os/agents`) : onglets agents (SEO, Discovery, Social, Prospection).
- **Prospection** (`/marketing-os/prospection`) : prospects, séquences, campagnes email.
- **Social Prospector** (`/marketing-os/social-prospector`) : interactions sociales, DM IA, approbation.
- **Campagnes** (`/marketing-os/campaign`) : campagnes email.
- **Intégrations** (`/marketing-os/integrations`) : CMS, etc.
- **SEO Strategy** (`/marketing-os/seo/strategy`), **Social** (`/marketing-os/social`), **Discovery Ads** (`/marketing-os/discovery/ads`).

---

## 6. Sales OS (CSO) — Fonctionnalités détaillées

### 6.1 Dashboard Sales (`/sales-os`)

- Vue d’ensemble pipeline et activité vente.

### 6.2 Radar à Signaux (`/sales-os/signals-radar`)

- Offres d’emploi (job boards) comme signaux d’intention. Coût : **job_board_signals** (15).

### 6.3 Local Radar (`/sales-os/local-radar`)

- Scan cartes / entreprises locales (Outscraper / Apify). Coût : **local_maps_scan** (10).

### 6.4 Pipeline Analytics (`/sales-os/analytics`)

- Métriques pipeline, tunnel par étape, valeur, win rate. Alimenté par `getPipelineAnalytics`.

### 6.5 CRM Pipeline (`/sales-os/crm`)

- Vue Kanban par statut de prospect, attribution par source (source, valeur).

### 6.6 Lead Scoring / Dashboard (`/sales-os/dashboard`)

- Score, température (HOT/WARM/COLD), résumé IA, accroche suggérée.

### 6.7 Reply Assistant (`/sales-os/reply-assistant`)

- Réponses de closing IA à partir du contexte prospect : analyse intention + 2 options A/B. Coût : **cso_closing_response** (5). Intégration liens calendrier / paiement.

### 6.8 Prospection (`/sales-os/prospection`)

- Découverte de leads, séquences, campagnes. Analyse prospect + stratégie de contact : **cso_prospect_analysis** (10).

### 6.9 Social Prospector (`/sales-os/social-prospector`)

- Même logique que CMO (interactions, DM, tracking). Coûts : social_prospector_track, social_prospector_dm.

### 6.10 Paramètres Sales (`/sales-os/settings`)

- Config spécifique CSO (SMTP, délivrabilité, etc.).

---

## 7. Auth, crédits & Stripe

### 7.1 Authentification

- NextAuth v5 : providers Google, GitHub, Facebook, credentials.
- Session utilisée partout (middleware, layout, server actions, API voice/transcribe).
- Un User peut avoir plusieurs Workspace (limité par plan).

### 7.2 Crédits

- **Stock** : `User.credits` (entier).
- **Coûts** : définis dans `CREDIT_COSTS` (`src/lib/credits.ts`) — une quarantaine d’opérations (SEO, social, ads, CSO, images, voice, agent brain, etc.).
- **Limites par plan** : `PLAN_LIMITS` (FREE 100/mois, BUSINESS 500, AGENCY 2000, SCALE 10000, + maxWorkspaces, maxProspects, autopilot, apiAccess).
- **Mécanismes** : `useCredits(userId, operation)`, `addCredits(userId, amount, reason)`, `withCredits(operation, workspaceId, callback)` (débit + remboursement en cas d’erreur). Traçabilité dans `APIUsage`.
- **UI** : `CreditsProvider` (contexte : credits, plan, isDepleted, canAfford). Sidebar : jauge, alerte (warning/critical/depleted), lien Paramètres. Sur chaque page consommatrice : bannière « Crédits épuisés » + désactivation des boutons d’action.

### 7.3 Stripe

- **Checkout** : `POST /api/stripe/checkout-subscription` avec `plan` (BUSINESS|AGENCY|SCALE) → création/récupération Customer + Checkout Session → redirection.
- **Portail** : `POST /api/stripe/portal` → Billing Portal pour gérer l’abonnement.
- **Webhook** : `checkout.session.completed` → mise à jour plan + crédits initiaux ; `customer.subscription.updated` / `deleted` → sync plan (ou FREE) ; `invoice.paid` → reset crédits au quota mensuel. Variables : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_AGENCY`, `STRIPE_PRICE_SCALE`.

---

## 8. Intégrations & services externes

| Service | Usage | Fichiers / env |
|---------|--------|-----------------|
| OpenAI | GPT, Whisper (transcription) | OPENAI_API_KEY, `lib/ai/langchain.ts`, `api/voice/transcribe` |
| Anthropic | Claude (agents, séquences) | ANTHROPIC_API_KEY, `lib/ai/agents/*` |
| Serper | Recherche, SERP, discovery | SERPER_API_KEY, `lib/ai/serper.ts` |
| DataForSEO | Métriques mots-clés, concurrence, authority, content gap | DATAFORSEO_*, `lib/seo/dataforseo-client.ts` |
| Banana / Nano Banana | Génération d’images | NANO_BANANA_API_KEY, `lib/ai/banana.ts`, `lib/services/image/nano-banana.ts` |
| Stripe | Paiements, abonnements, portail | STRIPE_*, `lib/services/sales/payments.ts`, routes API |
| Meta (Facebook/Instagram) | Ad Library, Pages, IG Business, Messaging, webhooks | META_*, `lib/services/ads/intelligence.ts`, `lib/services/meta/*` |
| TikTok / LinkedIn / Pinterest | Ad libraries (URLs config) | TIKTOK_AD_LIBRARY_URL, etc. |
| Resend / SendGrid | Emails (séquences, notifs) | RESEND_API_KEY, SENDGRID_API_KEY |
| SMTP / IMAP | Envoi + détection réponses | SmtpConfig, ImapFlow |
| Apollo / Hunter / Clay | Enrichissement leads | APOLLO_API_KEY, HUNTER_API_KEY, CLAY_API_KEY |
| Outscraper / Apify | Local Radar, signaux | OUTSCRAPER_API_KEY, APIFY_API_KEY |
| SerpAPI | Signaux d’intention | SERPAPI_API_KEY |
| PageSpeed | Audit technique SEO | PAGESPEED_API_KEY |

---

## 9. Jobs asynchrones (Inngest)

- **social-factory/generate** : stratégie → concepts → posts + images (débit crédits par étape).
- **agent-brain** : cycles d’observation + décisions (agent_brain_cycle, agent_brain_execute).
- **bulk-articles** : génération d’articles SEO en masse.
- **sequence-sender**, **campaign-sender** : envoi d’étapes de séquence / campagnes email.
- **reply-checker** : vérification des réponses (IMAP).
- **meta-dm-sender**, **meta-engagement-poller** : envoi DM Meta, polling engagement.
- **facebook-groups-cold-dm** : DM aux membres de groupes.

---

## 10. Points forts

- **Double positionnement CMO/CSO** clair avec deux sidebars et parcours dédiés.
- **Modèle de données riche** : prospects, interactions multi-canal, séquences, campagnes, Content Factory, Agent, pipeline, sources.
- **Système de crédits cohérent** : coûts par opération, vérification avant action, remboursement en erreur, traçabilité, UI uniforme (sidebar + bannières + désactivation à 0).
- **Stripe** bien intégré (checkout, portail, webhook pour plan + crédits mensuels).
- **Onboarding** guidé avec étapes dérivées des données (rétrocompat).
- **Voice-to-Content** (Whisper) intégré au SEO Factory avec débit de crédit et route protégée.
- **Analytics** avec pont CMO → vue pipeline CSO.
- **Error boundaries** et messages utilisateur en français.
- **Documentation** : `docs/DEPLOYMENT.md` pour déploiement et configuration.

---

## 11. Axes d’amélioration / recommandations

### 11.1 Opérationnel & config

- **Stripe** : créer les 3 produits/prix dans le Dashboard et renseigner les Price ID + webhook (voir `docs/DEPLOYMENT.md`).
- **Variables d’env** : centraliser la liste (ex. `.env.example`) à partir de `docs/DEPLOYMENT.md`.

### 11.2 Produit

- **Google Search Console** : connexion + données de performance (requêtes, clics, positions) pour enrichir l’analytics SEO.
- **Brand Memory** : mémoire marque persistante (au-delà de `brandVoice`) pour personnaliser tous les contenus (articles, posts, DM).
- **Publication directe** : LinkedIn / Instagram (posting natif depuis l’app en plus de la planification).
- **API publique / white-label** : pour le plan Agency (apiAccess), exposition d’endpoints pour les clients.

### 11.3 Technique

- **Tests** : tests E2E (Playwright) sur parcours critiques (inscription → onboarding → une action payante).
- **Monitoring** : Sentry (ou équivalent) pour les erreurs front/back et les performances.
- **Rate limiting** : sur les routes API et actions coûteuses (éviter abus).
- **Cache** : généraliser le pattern SEOIntelligenceCache pour d’autres appels DataForSEO / Serper si besoin de réduire coûts et latence.

### 11.4 UX

- **Onboarding** : rappel du coût en crédits pour l’étape « premier article » (déjà 8 crédits).
- **Paramètres** : afficher l’historique des crédits (débits/jours) ou un lien vers une page « Usage ».
- **CSO** : appliquer le même pattern d’alerte crédits (bannière + désactivation des actions) sur les pages Sales OS qui consomment des crédits (Reply Assistant, Radars, Prospection, Social Prospector) si ce n’est pas déjà fait partout.

---

*Document généré à partir du codebase — février 2025.*
