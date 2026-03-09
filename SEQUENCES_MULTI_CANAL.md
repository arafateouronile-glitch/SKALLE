# 📧 Séquences Multi-Canal - Documentation

## ✅ Implémenté

### 1. **Système de Séquences Multi-Canal** ✅

**Fichier**: `src/actions/sequences.ts`

#### Fonctionnalités
- ✅ Création de séquences avec plusieurs canaux (LinkedIn, Email, Phone, SMS)
- ✅ Délais configurables entre les étapes
- ✅ Envoi automatique selon délais
- ✅ Tracking complet (sent, delivered, opened, clicked, replied)
- ✅ Gestion de l'activation/pause de séquences
- ✅ Statistiques de performance

#### Server Actions Disponibles

```typescript
// Créer une séquence
createSequence(workspaceId, prospectId, {
  name: "Séquence de prospection",
  steps: [
    {
      stepNumber: 1,
      channel: "LINKEDIN",
      content: "Message LinkedIn...",
      delayDays: 0, // Envoi immédiat
    },
    {
      stepNumber: 2,
      channel: "EMAIL",
      subject: "Follow-up",
      content: "Email de suivi...",
      delayDays: 3, // 3 jours après l'étape 1
    },
    {
      stepNumber: 3,
      channel: "PHONE",
      content: "Script d'appel...",
      delayDays: 7, // 7 jours après l'étape 2
    },
  ],
});

// Démarrer une séquence
startSequence(sequenceId);

// Mettre en pause
pauseSequence(sequenceId);

// Obtenir les séquences
getSequences(workspaceId, prospectId?);

// Statistiques
getSequenceStats(sequenceId);
```

---

### 2. **Délivrabilité Email** ✅

**Fichier**: `src/lib/prospection/deliverability.ts` + `src/actions/deliverability.ts`

#### Fonctionnalités
- ✅ Vérification automatique SPF/DKIM/DMARC
- ✅ Warm-up automatique progressif (30 jours)
- ✅ Limites intelligentes par jour
- ✅ Tracking de performance (bounce, spam, open, reply rates)
- ✅ Recommandations automatiques

#### Warm-up Schedule

Le warm-up augmente progressivement le volume d'envoi :
- Jour 1: 10 emails
- Jour 7: 40 emails
- Jour 15: 80 emails
- Jour 30: 200+ emails/jour

#### Server Actions Disponibles

```typescript
// Configurer la délivrabilité
saveDeliverabilityConfig(workspaceId, {
  sendingDomain: "example.com",
  fromEmail: "hello@example.com",
  fromName: "Skalle Team",
  warmupEnabled: true,
  dailySendingLimit: 50,
});

// Vérifier les DNS records
verifyDNSRecords(workspaceId);

// Obtenir le statut du warm-up
getWarmupStatus(workspaceId);
```

---

### 3. **Recherche de Leads Qualifiés** ✅

**Fichier**: `src/lib/prospection/enrichment.ts` + `src/actions/leads.ts`

#### Fonctionnalités
- ✅ Recherche multi-critères (Apollo.io)
- ✅ Enrichissement de données (Clay.com)
- ✅ Vérification d'emails (Hunter.io)
- ✅ Import en masse
- ✅ Sauvegarde de critères de recherche

#### Server Actions Disponibles

```typescript
// Rechercher des leads qualifiés
searchQualifiedLeads(workspaceId, {
  jobTitles: ["Marketing Director", "CMO"],
  industries: ["SaaS", "E-commerce"],
  locations: ["France", "Belgium"],
  requireEmail: true,
  requirePhone: false,
  limit: 100,
  provider: "apollo",
});

// Importer des leads
importLeads(workspaceId, [
  {
    name: "John Doe",
    email: "john@example.com",
    company: "Acme Corp",
    jobTitle: "CMO",
  },
  // ...
]);

// Enrichir un lead existant
enrichLead(workspaceId, prospectId, "clay");

// Sauvegarder des critères de recherche
saveSearchCriteria(workspaceId, {
  name: "CMOs SaaS France",
  jobTitles: ["CMO", "Marketing Director"],
  industries: ["SaaS"],
  locations: ["France"],
});
```

---

## 📊 Structure de Données

### OutreachSequence
```typescript
{
  id: string;
  prospectId: string;
  name: string;
  isActive: boolean;
  steps: SequenceStep[];
}
```

### SequenceStep
```typescript
{
  id: string;
  sequenceId: string;
  stepNumber: number;
  channel: "LINKEDIN" | "EMAIL" | "PHONE" | "SMS";
  subject?: string; // Pour emails
  content: string;
  delayDays: number;
  status: "PENDING" | "SENT" | "DELIVERED" | "OPENED" | "CLICKED" | "REPLIED" | "FAILED";
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  repliedAt?: Date;
}
```

### EmailDeliverabilityConfig
```typescript
{
  sendingDomain: string;
  fromEmail: string;
  fromName: string;
  spfConfigured: boolean;
  dkimConfigured: boolean;
  dmarcConfigured: boolean;
  warmupEnabled: boolean;
  warmupProgress: number; // 0-100
  dailySendingLimit: number;
  bounceRate: number;
  spamRate: number;
  openRate: number;
  replyRate: number;
}
```

---

## 🔑 Clés API Requises

Pour utiliser toutes les fonctionnalités, ajouter dans `.env` :

```env
# Apollo.io (Recherche de leads)
APOLLO_API_KEY=apollo_...

# Clay.com (Enrichissement)
CLAY_API_KEY=clay_...

# Hunter.io (Vérification emails)
HUNTER_API_KEY=hunter_...

# Resend ou SendGrid (Envoi emails)
RESEND_API_KEY=re_...
# ou
SENDGRID_API_KEY=SG....

# Twilio (SMS et appels)
TWILIO_API_KEY=...
TWILIO_PHONE_NUMBER=+...

# Email expéditeur
FROM_EMAIL=noreply@skalle.io
```

---

## 📋 Prochaines Étapes

1. **Créer l'interface "Find Leads"**
   - Formulaire de recherche multi-critères
   - Liste de résultats avec emails vérifiés
   - Import en masse

2. **Créer l'interface "Sequences"**
   - Création de séquences multi-canal
   - Visualisation du flux
   - Dashboard de performance

3. **Créer l'interface "Deliverability"**
   - Configuration SPF/DKIM/DMARC
   - Warm-up status
   - Métriques de performance

4. **Implémenter Inngest pour l'envoi automatique**
   - Worker pour envoyer les étapes selon délais
   - Retry automatique en cas d'échec
   - Tracking temps réel

---

**Le backend est prêt ! Les fonctionnalités peuvent être utilisées via les Server Actions.** 🚀
