// Pre-built sequence templates for SKALLE
// Each template is a complete multi-step outreach sequence

export type TemplateChannel = "EMAIL" | "LINKEDIN";
export type TemplateTrigger = "ALWAYS" | "IF_NO_REPLY" | "IF_OPENED_NO_REPLY";
export type TemplateCategory = "saas" | "agency" | "b2b" | "enterprise" | "ecommerce" | "recrutement";

export interface TemplateStep {
  stepNumber: number;
  channel: TemplateChannel;
  subject?: string;
  content: string;
  delayDays: number;
  triggerCondition: TemplateTrigger;
}

export interface SequenceTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  useCase: string;
  avgReplyRate: string; // indicative benchmark
  steps: TemplateStep[];
  tags: string[];
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  saas:       "SaaS / Tech",
  agency:     "Agence",
  b2b:        "B2B Services",
  enterprise: "Enterprise",
  ecommerce:  "E-commerce",
  recrutement:"Recrutement",
};

export const CATEGORY_COLORS: Record<TemplateCategory, { bg: string; fg: string }> = {
  saas:       { bg: "rgba(99,102,241,0.15)",  fg: "#818cf8" },
  agency:     { bg: "rgba(236,72,153,0.15)",  fg: "#f472b6" },
  b2b:        { bg: "rgba(14,165,233,0.15)",  fg: "#38bdf8" },
  enterprise: { bg: "rgba(168,85,247,0.15)",  fg: "#c084fc" },
  ecommerce:  { bg: "rgba(245,158,11,0.15)",  fg: "#fbbf24" },
  recrutement:{ bg: "rgba(34,197,94,0.15)",   fg: "#4ade80" },
};

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // 1. SaaS Cold Outreach — Court et direct
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "saas-cold-short",
    name: "SaaS — Cold outreach court",
    category: "saas",
    description: "Séquence courte et directe pour les décideurs tech. Mise sur la curiosité plutôt que la vente.",
    useCase: "Prospects SaaS / CTO / VP Product froids",
    avgReplyRate: "8–14%",
    tags: ["cold", "court", "tech", "décideur"],
    steps: [
      {
        stepNumber: 1,
        channel: "EMAIL",
        subject: "{{firstName}}, question rapide sur {{company}}",
        content: `Bonjour {{firstName}},

Je travaille avec quelques équipes similaires à {{company}} et j'ai remarqué un pattern récurrent : [problème spécifique à leur secteur].

Est-ce que c'est quelque chose que vous rencontrez aussi chez {{company}} ?

(Si ce n'est pas le bon moment, dites-le moi — pas de souci.)

[Votre prénom]`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

Je vous ai envoyé un email il y a quelques jours au sujet de [problème]. Je voulais m'assurer qu'il n'était pas passé à la trappe.

Une question simple : comment gérez-vous [problème] chez {{company}} aujourd'hui ?`,
        delayDays: 4,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "EMAIL",
        subject: "Re: {{firstName}}, question rapide sur {{company}}",
        content: `{{firstName}},

Dernier message de ma part — je ne veux pas vous spammer.

Si [problème] n'est pas une priorité pour {{company}} en ce moment, pas de problème. Mais si jamais ça change, je serais ravi d'en discuter.

Je laisse le lien de mon calendrier ici si vous voulez 15 minutes : [lien Calendly]

Bonne continuation,
[Votre prénom]`,
        delayDays: 7,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. SaaS — Demo booking (chaud, déjà intéressé)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "saas-demo-booking",
    name: "SaaS — Booking de démo",
    category: "saas",
    description: "Pour des prospects déjà engagés (visiteurs site, webinar, inbound). Objectif : caler une démo rapidement.",
    useCase: "Leads inbound / MQL chauds",
    avgReplyRate: "25–40%",
    tags: ["inbound", "démo", "chaud", "MQL"],
    steps: [
      {
        stepNumber: 1,
        channel: "EMAIL",
        subject: "Votre accès à [Produit] — 15 min pour démarrer ?",
        content: `Bonjour {{firstName}},

J'ai vu que vous aviez [visité notre site / téléchargé notre guide / participé au webinar] — merci de l'intérêt !

Je serais ravi de vous montrer en 15 minutes comment {{company}} peut [bénéfice clé]. Voici mon calendrier : [lien Calendly]

Ou dites-moi quand vous êtes disponible cette semaine.

[Votre prénom]`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "EMAIL",
        subject: "Re: Votre accès à [Produit]",
        content: `{{firstName}},

Je me permets de relancer — j'imagine que vous êtes sous l'eau.

Pour gagner du temps : [lien Calendly] — 15 minutes suffisent pour voir si ça matche avec {{company}}.

[Votre prénom]`,
        delayDays: 2,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

Je vous ai envoyé deux emails au sujet de [Produit] — je voulais m'assurer que vous les aviez bien reçus.

Avez-vous 15 minutes cette semaine pour qu'on en discute ?`,
        delayDays: 3,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Agence — Prospection client
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "agency-client-acquisition",
    name: "Agence — Acquisition client",
    category: "agency",
    description: "Séquence pour les agences (marketing, web, SEO, social) qui prospectent des directeurs marketing.",
    useCase: "CMO / Directeur Marketing / E-commerce managers",
    avgReplyRate: "10–18%",
    tags: ["agence", "CMO", "marketing", "prestation"],
    steps: [
      {
        stepNumber: 1,
        channel: "EMAIL",
        subject: "{{company}} + [Votre agence] — une idée",
        content: `Bonjour {{firstName}},

J'ai regardé la présence digitale de {{company}} et j'ai repéré [observation spécifique : ex. "vos ads Facebook tournent depuis 6 mois sans variation de créatifs"].

On a aidé [client similaire] à [résultat concret : +32% de ROAS en 8 semaines] en faisant [action précise].

Ça vaut le coup d'en parler 20 minutes ?

[Votre prénom]
[Votre agence]`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

Je vous ai envoyé un email la semaine dernière au sujet de [observation sur {{company}}].

Je travaille avec des équipes similaires et les résultats sont souvent rapides — 20 minutes pour vous montrer concrètement ?`,
        delayDays: 5,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "EMAIL",
        subject: "Re: {{company}} + [Votre agence] — étude de cas",
        content: `{{firstName}},

Je partage ici une étude de cas de [secteur similaire] avant de fermer ce dossier.

[Lien ou attachment de l'étude de cas]

Si le sujet vous intéresse un jour, mon calendrier : [lien]

[Votre prénom]`,
        delayDays: 7,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 4,
        channel: "EMAIL",
        subject: "Dernière tentative — {{firstName}}",
        content: `{{firstName}},

Je ne veux pas vous embêter davantage. Je ferme ce dossier de mon côté.

Si vos priorités changent sur [sujet] dans les prochains mois, n'hésitez pas à me recontacter directement.

Bonne continuation à vous et à l'équipe {{company}}.

[Votre prénom]`,
        delayDays: 14,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. B2B Services — Consultants / Freelances
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "b2b-consultant",
    name: "B2B Services — Consultant / Freelance",
    category: "b2b",
    description: "Pour consultants et freelances B2B qui veulent pitcher leur expertise sans paraître pushy.",
    useCase: "Directeurs, DG, CFO, DRH — PME/ETI",
    avgReplyRate: "12–20%",
    tags: ["consultant", "freelance", "expertise", "PME"],
    steps: [
      {
        stepNumber: 1,
        channel: "EMAIL",
        subject: "Une question sur [problème métier] chez {{company}}",
        content: `Bonjour {{firstName}},

Je suis [votre titre] spécialisé en [domaine]. J'accompagne des entreprises comme {{company}} sur [problème spécifique].

Avant de vous proposer quoi que ce soit, j'aimerais comprendre comment {{company}} gère [aspect spécifique] aujourd'hui.

Avez-vous 10 minutes la semaine prochaine ?

[Votre prénom]`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "EMAIL",
        subject: "Re: Une question sur [problème métier] chez {{company}}",
        content: `{{firstName}},

Je me permets de relancer mon message précédent.

J'ai aidé récemment [entreprise similaire] à [résultat concret]. Je pense qu'il y a peut-être quelque chose d'applicable chez {{company}}.

10 minutes cette semaine ?

[Votre prénom]`,
        delayDays: 5,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

Je vous ai contacté par email au sujet de [problème]. Je voulais m'assurer que vous l'aviez bien reçu.

Je partage ici un article que j'ai écrit sur ce sujet — peut-être que ça vous donnera un contexte sur mon approche : [lien article]

[Votre prénom]`,
        delayDays: 4,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Enterprise — Deal complexe / long cycle
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "enterprise-long-cycle",
    name: "Enterprise — Deal long cycle",
    category: "enterprise",
    description: "Séquence longue pour des deals enterprise (6-18 mois de cycle). Approche multi-stakeholders et value-based.",
    useCase: "C-suite / VP / Director — grands comptes 500+ employés",
    avgReplyRate: "5–10%",
    tags: ["enterprise", "long cycle", "ABM", "C-suite"],
    steps: [
      {
        stepNumber: 1,
        channel: "EMAIL",
        subject: "[Insight sur leur secteur] — impact pour {{company}}",
        content: `Bonjour {{firstName}},

[Insight de secteur basé sur des données récentes : ex. "Les entreprises de votre secteur ont réduit leurs coûts opérationnels de 23% en moyenne en adoptant X."]

Chez {{company}}, comment abordez-vous [problème lié à l'insight] ?

Je ne cherche pas à vous vendre quoi que ce soit à ce stade — je veux juste comprendre si c'est un sujet sur votre radar.

[Votre prénom]
[Titre] chez [Entreprise]`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

J'ai partagé un insight sur [sujet] avec vous par email. J'ai pensé à vous en lisant [article récent sur leur secteur].

Je travaille avec des équipes comme celle de {{company}} sur [problème]. Voici comment [client référence] a abordé ce sujet : [lien case study]`,
        delayDays: 7,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "EMAIL",
        subject: "Étude de cas — [entreprise similaire] + [résultat]",
        content: `{{firstName}},

Je partage ici l'étude de cas de [entreprise similaire à {{company}}] qui a fait face au même défi et obtenu [résultat mesurable].

[2-3 lignes résumé du cas]

Est-ce qu'un appel de 30 minutes pour explorer si c'est applicable à {{company}} aurait du sens ?

[Votre prénom]`,
        delayDays: 10,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 4,
        channel: "EMAIL",
        subject: "{{firstName}} — une dernière idée",
        content: `{{firstName}},

Je réalise que vous êtes probablement très occupé et que ce n'est peut-être pas le bon moment.

Je voulais juste laisser ici [ressource pertinente : livre blanc, rapport, tool] qui pourrait être utile à votre équipe indépendamment de toute collaboration.

Si le sujet [problème] remonte dans vos priorités, vous saurez où me trouver.

Bonne continuation,
[Votre prénom]`,
        delayDays: 21,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 6. E-commerce — Partenariat / Wholesale
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "ecommerce-partnership",
    name: "E-commerce — Partenariat / Wholesale",
    category: "ecommerce",
    description: "Pour approcher des retailers, distributeurs ou partenaires e-commerce.",
    useCase: "Buyers / Directeurs achat / Responsables marketplace",
    avgReplyRate: "8–15%",
    tags: ["ecommerce", "wholesale", "retail", "partenariat"],
    steps: [
      {
        stepNumber: 1,
        channel: "EMAIL",
        subject: "Partenariat {{company}} × [Votre marque] — opportunité",
        content: `Bonjour {{firstName}},

J'ai regardé l'offre de {{company}} et je pense qu'il y a une vraie complémentarité avec [Votre marque / produit].

Nos clients partagent le même profil que vos acheteurs : [description ICP commun]. On pourrait créer quelque chose d'intéressant ensemble.

Avez-vous 20 minutes pour explorer ça ?

[Votre prénom]
[Votre marque]`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "EMAIL",
        subject: "Re: Partenariat {{company}} × [Votre marque]",
        content: `{{firstName}},

Je reviens sur mon email précédent.

Pour vous donner un aperçu rapide : [Votre marque] génère [chiffre clé : X commandes/mois, Y€ de CA, Z% de croissance]. Voici notre catalogue : [lien].

Si ça vous intéresse, je suis disponible cette semaine.

[Votre prénom]`,
        delayDays: 4,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

Je vous ai envoyé deux emails au sujet d'un partenariat entre {{company}} et [Votre marque].

Je voulais m'assurer que vous les aviez bien reçus — et vous proposer un échange rapide cette semaine si le sujet vous intéresse.`,
        delayDays: 5,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Recrutement — Approche candidat passif
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "recruitment-passive",
    name: "Recrutement — Candidat passif",
    category: "recrutement",
    description: "Approcher des talents non-actifs sur le marché. Ton conversationnel et respect du timing.",
    useCase: "Recruteurs / Head Hunters — talents en poste",
    avgReplyRate: "15–25%",
    tags: ["recrutement", "passif", "talent", "chasse"],
    steps: [
      {
        stepNumber: 1,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

Je suis [Votre prénom], [Titre] chez [Entreprise]. J'ai été impressionné par [observation spécifique sur leur profil/expérience].

On recherche un/une [poste] et votre profil correspond parfaitement à ce qu'on cherche.

Je ne sais pas si vous êtes en recherche active, mais une conversation exploratoire vous intéresserait-elle ? Pas d'engagement de votre côté.`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "EMAIL",
        subject: "{{firstName}} — opportunité chez [Entreprise]",
        content: `Bonjour {{firstName}},

Je vous ai contacté sur LinkedIn il y a quelques jours. Je me permets de vous envoyer plus d'informations sur l'opportunité.

Le poste en question : [description courte du rôle + 3 raisons pourquoi c'est intéressant].

Ce qu'on offre : [rémunération indicative / avantages clés / modèle de travail].

Une discussion de 20 minutes pour en savoir plus vous intéresse ?

[Votre prénom]`,
        delayDays: 5,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "LINKEDIN",
        content: `{{firstName}},

Dernier message de ma part — je ne veux pas être intrusif.

Si le timing n'est pas bon maintenant, je reste disponible si votre situation change. N'hésitez pas à me recontacter.

Et si vous connaissez quelqu'un dans votre réseau qui pourrait être intéressé par [poste] chez [Entreprise], je prends les recommandations avec plaisir !`,
        delayDays: 10,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 8. LinkedIn-first — Social selling pur
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "linkedin-social-selling",
    name: "LinkedIn-first — Social selling",
    category: "b2b",
    description: "Séquence 100% LinkedIn pour les prospects où vous n'avez pas d'email. Approche relationnelle.",
    useCase: "Décideurs B2B avec profil LinkedIn actif",
    avgReplyRate: "12–22%",
    tags: ["linkedin", "social selling", "sans email", "relationnel"],
    steps: [
      {
        stepNumber: 1,
        channel: "LINKEDIN",
        content: `Bonjour {{firstName}},

J'ai vu votre post sur [sujet récent de leur feed] — point très juste sur [aspect spécifique].

Je travaille sur des problématiques similaires chez [vos clients]. On pourrait certainement avoir une conversation intéressante.

Je me permets de vous ajouter à mon réseau.`,
        delayDays: 0,
        triggerCondition: "ALWAYS",
      },
      {
        stepNumber: 2,
        channel: "LINKEDIN",
        content: `{{firstName}},

Merci pour l'ajout !

Je voulais revenir sur [problème spécifique au secteur de {{company}}]. On aide des équipes comme la vôtre à [résultat clé].

Ça vous dirait d'en discuter 15 minutes ?`,
        delayDays: 3,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 3,
        channel: "LINKEDIN",
        content: `{{firstName}},

Je partage ici [resource : article, étude, outil] qui pourrait être utile à votre équipe — sans lien avec une démarche commerciale, juste parce que je pense que ça peut vous apporter de la valeur.

[Lien + 1 ligne de contexte]`,
        delayDays: 7,
        triggerCondition: "IF_NO_REPLY",
      },
      {
        stepNumber: 4,
        channel: "LINKEDIN",
        content: `{{firstName}},

Un dernier message pour ne pas encombrer votre boîte.

Si [problème] remonte dans vos priorités, n'hésitez pas à me recontacter. Je reste disponible.

Bonne continuation !`,
        delayDays: 14,
        triggerCondition: "IF_NO_REPLY",
      },
    ],
  },
];

export function getTemplateById(id: string): SequenceTemplate | undefined {
  return SEQUENCE_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: TemplateCategory): SequenceTemplate[] {
  return SEQUENCE_TEMPLATES.filter((t) => t.category === category);
}
