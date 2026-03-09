# 🎯 SEO Actions - Server Actions Typées

## ✅ Fichier Créé

Le fichier **`src/actions/seo-actions.ts`** a été créé avec succès !

---

## 📊 Interfaces TypeScript

### `SEOAuditMetadata`
Métadonnées on-page du site analysé :
- `title`, `description`, `h1`, `h2s`
- `lang`, `wordCount`
- `internalLinks`, `externalLinks`
- `theme` (thématique principale)

### `SEOAuditTargetKeyword`
Mots-clés identifiés avec intelligence :
- `term` : Le mot-clé
- `intent` : Intention (commercial, informationnel, navigationnel, transactionnel)
- `difficulty` : Difficulté (easy, medium, hard)
- `priority` : Priorité (boolean)
- `volumeEstimate` : Volume estimé (low, medium, high)
- `competitors` : Concurrents sur ce mot-clé

### `SEOAuditCompetitor`
Analyse d'un concurrent :
- `domain` : Domaine du concurrent
- `strength` : Forces identifiées
- `weakness` : Faiblesses identifiées
- `topPages` : Pages les plus performantes
- `authorityScore` : Score d'autorité (0-100)
- `contentLength`, `hasStructuredData`, `hasOpenGraph`

### `SEOAuditActionPlan`
Plan d'action complet :
- `technicalActions` : Actions techniques prioritaires
- `semanticGap` : Gaps sémantiques identifiés
- `quickWins` : Opportunités faciles
- `swot` : Analyse SWOT complète
- `internalLinkingStrategy` : Stratégie de maillage interne

### `SEOAuditData`
Type complet de l'audit avec tous les champs typés.

---

## 🔧 Fonctions Server Actions

### `getLatestAudit(workspaceId: string)`

Récupère le dernier audit SEO pour un workspace.

**Retourne** : `SEOAuditData | null`

**Exemple d'utilisation** :
```typescript
const audit = await getLatestAudit(workspaceId);

if (!audit) {
  return <EmptyState />;
}

// Maintenant TypeScript connaît tous les types !
console.log(audit.actionPlan?.quickWins); // ✅ Typé !
console.log(audit.targetKeywords?.[0].term); // ✅ Typé !
```

### `triggerSeoAnalysis(workspaceId: string, url: string)`

Lance une nouvelle analyse SEO Intelligence.

**Retourne** : `{ success: boolean; error?: string }`

**Fonctionnalités** :
- ✅ Vérification d'authentification
- ✅ Vérification du workspace
- ✅ Validation de l'URL
- ✅ Gestion des crédits
- ✅ `revalidatePath` pour rafraîchir la page automatiquement

**Exemple d'utilisation** :
```typescript
const result = await triggerSeoAnalysis(workspaceId, "https://example.com");

if (result.success) {
  toast.success("Analyse lancée !");
  // La page se rafraîchira automatiquement grâce à revalidatePath
} else {
  toast.error(result.error);
}
```

### `getAllAudits(workspaceId: string, limit?: number)`

Récupère tous les audits SEO pour un workspace (avec pagination).

**Retourne** : `SEOAuditData[]`

### `getAuditById(workspaceId: string, auditId: string)`

Récupère un audit SEO spécifique par son ID.

**Retourne** : `SEOAuditData | null`

---

## 🛡️ Sécurité

Toutes les fonctions incluent :
- ✅ Vérification d'authentification (`auth()`)
- ✅ Vérification de propriété du workspace
- ✅ Gestion d'erreurs complète
- ✅ `"use server"` pour garantir l'exécution côté serveur

---

## 🔄 Intégration avec le Frontend

### Dans un Composant React

```typescript
"use client";

import { getLatestAudit, triggerSeoAnalysis } from "@/actions/seo-actions";
import type { SEOAuditData } from "@/actions/seo-actions";

export default function StrategyPage() {
  const [audit, setAudit] = useState<SEOAuditData | null>(null);
  
  useEffect(() => {
    loadAudit();
  }, []);

  const loadAudit = async () => {
    const data = await getLatestAudit(workspaceId);
    setAudit(data);
  };

  const handleAnalyze = async () => {
    const result = await triggerSeoAnalysis(workspaceId, url);
    if (result.success) {
      // La page se rafraîchira automatiquement
      setTimeout(() => loadAudit(), 3000);
    }
  };

  if (!audit) {
    return <EmptyState onAnalyze={handleAnalyze} />;
  }

  return <StrategyDashboard data={audit} />;
}
```

---

## 🎯 Avantages du Typage

### Avant (sans typage)
```typescript
const audit = await getLatestAudit(workspaceId);
// audit.actionPlan.quickWins ❌ TypeScript ne connaît pas la structure
// audit.targetKeywords[0].term ❌ Erreur possible
```

### Après (avec typage)
```typescript
const audit = await getLatestAudit(workspaceId);
// audit.actionPlan?.quickWins ✅ Autocomplétion complète !
// audit.targetKeywords?.[0].term ✅ TypeScript connaît la structure !
// audit.competitors?.[0].authorityScore ✅ Typé !
```

---

## 🔄 revalidatePath

La fonction `triggerSeoAnalysis` utilise `revalidatePath` pour :
- Rafraîchir automatiquement `/dashboard/seo/strategy`
- Rafraîchir automatiquement `/dashboard/seo-factory`

Cela signifie que **sans rechargement manuel**, la page affichera les nouvelles données dès que l'analyse est terminée.

---

## 📝 Notes Importantes

1. **Import dynamique** : Les fonctions utilisent `"use server"` donc elles ne peuvent être appelées que depuis des composants serveur ou via des Server Actions.

2. **Gestion des crédits** : `triggerSeoAnalysis` utilise `withCredits` pour décompter automatiquement les crédits.

3. **Erreurs** : Toutes les fonctions gèrent les erreurs et retournent des messages clairs.

4. **Performance** : Les données JSON sont castées une seule fois, optimisant les performances.

---

## ✅ Checklist de Validation

- [x] Fichier `seo-actions.ts` créé
- [x] Interfaces TypeScript complètes
- [x] Fonction `getLatestAudit()` avec typage
- [x] Fonction `triggerSeoAnalysis()` avec revalidatePath
- [x] Fonction `getAllAudits()` pour pagination
- [x] Fonction `getAuditById()` pour récupération spécifique
- [x] Sécurité (auth, workspace check)
- [x] Gestion d'erreurs
- [x] Intégration avec la page Strategy Center
- [x] Documentation complète

**Les Server Actions typées sont maintenant prêtes à être utilisées !** 🎯
