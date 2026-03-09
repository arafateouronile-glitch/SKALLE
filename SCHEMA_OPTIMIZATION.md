# 🗄️ Optimisation du Schéma Prisma - SEO Intelligence

## ✅ Changements Appliqués

Le schéma Prisma a été optimisé pour stocker l'intelligence stratégique SEO de manière structurée et exploitable.

---

## 📊 Nouveau Format du Modèle `SEOAudit`

### Champs Principaux

```prisma
model SEOAudit {
  id              String    @id @default(cuid())
  url             String
  globalScore     Int       @default(0) // Score SEO global 0-100
  
  // Analyse On-Page brute
  metadata        Json?     // { title, description, h1, h2s, lang, wordCount, internalLinks, externalLinks, theme }
  
  // Intelligence Mots-clés
  targetKeywords  Json?     // [{ term, intent, difficulty, priority, volumeEstimate, competitors }]
  
  // Analyse Concurrentielle
  competitors     Json?     // [{ domain, strength[], weakness[], topPages[], authorityScore, ... }]
  
  // Stratégie & Plan d'action
  actionPlan      Json?     // { technicalActions[], semanticGap[], quickWins[], swot, internalLinkingStrategy }
  
  // Backward compatibility (anciens champs conservés)
  report          Json?
  targetKeyword   String?
  technicalReport Json?
  onPageReport    Json?
  aiRecommendations Json?
  competitorData  Json?
  score           Int?
  
  workspaceId     String
  workspace       Workspace @relation(...)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

---

## 🎯 Structure des Données JSON

### 1. `metadata` (Analyse On-Page)

```typescript
{
  title: string | null;
  description: string | null;
  h1: string | null;
  h2s: string[];
  lang: string;
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  theme: string; // Thématique principale résumée par IA
}
```

### 2. `targetKeywords` (Intelligence Mots-clés)

```typescript
[
  {
    term: string;                    // "marketing digital"
    intent: "commercial" | "informationnel" | "navigationnel" | "transactionnel";
    difficulty: "easy" | "medium" | "hard";
    priority: boolean;                // true = Quick Win
    volumeEstimate: "low" | "medium" | "high";
    competitors: [
      {
        domain: string;
        title: string;
        position: number;
      }
    ];
  }
]
```

### 3. `competitors` (Analyse Concurrentielle)

```typescript
[
  {
    domain: string;                  // "concurrent.com"
    strength: string[];              // ["Contenu long", "Structured data"]
    weakness: string[];               // ["Pas de Open Graph", "Peu de liens internes"]
    topPages: string[];               // URLs des pages les plus performantes
    authorityScore: number;           // 0-100
    contentLength: number | null;
    hasStructuredData: boolean;
    hasOpenGraph: boolean;
  }
]
```

### 4. `actionPlan` (Stratégie & Plan d'Action)

```typescript
{
  technicalActions: [
    {
      priority: "high" | "medium" | "low";
      action: string;                 // "Optimiser le titre"
      description: string;
      estimatedImpact: number;       // 1-5
    }
  ];
  semanticGap: [
    {
      topic: string;                  // "Sujet non traité"
      competitors: string[];          // ["concurrent1.com", "concurrent2.com"]
      recommendation: string;
    }
  ];
  quickWins: [
    {
      keyword: string;
      difficulty: "easy" | "medium" | "hard";
      opportunity: string;
      estimatedImpact: number;        // 1-5
    }
  ];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  internalLinkingStrategy: {
    priorityPages: string[];
    suggestedStructure: string;
    hubPages: string[];
  };
}
```

---

## 🔧 Fonctions Helper Créées

Un nouveau fichier `src/lib/seo/audit-helpers.ts` a été créé avec des fonctions utilitaires :

### Récupération de Données

- `getLatestSEOAudit(workspaceId)` - Récupère le dernier audit
- `getPriorityKeywords(workspaceId)` - Mots-clés prioritaires
- `getQuickWins(workspaceId)` - Opportunités faciles
- `getTechnicalActions(workspaceId)` - Actions techniques
- `getSemanticGaps(workspaceId)` - Gaps sémantiques
- `getSWOTAnalysis(workspaceId)` - Analyse SWOT
- `getTopCompetitors(workspaceId, limit)` - Top concurrents

### Pour l'Auto-pilot

- `getKeywordsForArticleGeneration(workspaceId)` - Mots-clés pour génération d'articles
- `getInternalLinkingStrategy(workspaceId)` - Stratégie de maillage interne
- `getSEOAuditStats(workspaceId)` - Statistiques de l'audit

---

## 🚀 Utilisation par l'Auto-pilot

### Exemple : Génération d'Article avec Intelligence SEO

```typescript
import { getKeywordsForArticleGeneration, getInternalLinkingStrategy } from "@/lib/seo/audit-helpers";

// 1. Récupérer les mots-clés prioritaires
const keywords = await getKeywordsForArticleGeneration(workspaceId);
const selectedKeyword = keywords.quickWins[0]; // Premier Quick Win

// 2. Récupérer la stratégie de maillage interne
const linkingStrategy = await getInternalLinkingStrategy(workspaceId);

// 3. Générer l'article avec ces informations
const article = await generateArticle({
  keyword: selectedKeyword.term,
  // L'IA sait maintenant :
  // - Sur quel mot-clé se positionner (selectedKeyword.term)
  // - Qui sont les concurrents à battre (selectedKeyword.competitors)
  // - Vers quelles pages faire des liens internes (linkingStrategy.priorityPages)
  // - Le ton de la marque (workspace.brandVoice)
});
```

---

## 📝 Migration Prisma

Pour appliquer ces changements à votre base de données :

```bash
# 1. Formater le schéma
npx prisma format

# 2. Créer la migration
npx prisma migrate dev --name optimize_seo_audit_schema

# 3. Générer le client Prisma
npx prisma generate
```

**Note** : Les anciens champs sont conservés pour la compatibilité ascendante. Les anciens audits continueront de fonctionner.

---

## 🎯 Avantages du Nouveau Format

### 1. **Structure Optimisée**
- Données organisées par catégorie (metadata, keywords, competitors, actionPlan)
- Format JSON flexible mais structuré
- Facile à interroger et à utiliser

### 2. **Intégration Auto-pilot**
- Les mots-clés prioritaires sont directement exploitables
- La stratégie de maillage interne est prête à l'emploi
- Les Quick Wins sont identifiés automatiquement

### 3. **Performance**
- Index sur `workspaceId` pour récupération rapide
- Données structurées = moins de parsing
- Jointure facile avec `Workspace.brandVoice`

### 4. **Évolutivité**
- Format JSON permet d'ajouter de nouveaux champs sans migration
- Compatibilité ascendante maintenue
- Facile à étendre avec de nouvelles analyses

---

## 🔍 Exemple de Requête

```typescript
// Récupérer l'audit complet
const audit = await prisma.sEOAudit.findFirst({
  where: { workspaceId },
  orderBy: { createdAt: "desc" },
});

// Accéder aux données structurées
const metadata = audit.metadata as MetadataFormat;
const keywords = audit.targetKeywords as TargetKeywordFormat[];
const competitors = audit.competitors as CompetitorFormat[];
const actionPlan = audit.actionPlan as ActionPlanFormat;

// Utiliser les Quick Wins
const quickWins = actionPlan.quickWins.filter(w => w.difficulty === "easy");
```

---

## ✅ Checklist de Validation

- [x] Schéma Prisma mis à jour
- [x] Code de sauvegarde adapté (`discovery.ts`)
- [x] Fonctions helper créées (`audit-helpers.ts`)
- [x] Backward compatibility maintenue
- [x] Documentation complète

**Le schéma est maintenant optimisé et prêt à être utilisé par l'Auto-pilot !** 🎯
