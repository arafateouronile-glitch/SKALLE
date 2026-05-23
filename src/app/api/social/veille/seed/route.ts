/**
 * POST /api/social/veille/seed
 * Insère des posts viraux de démonstration si la DB est vide.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SEED_POSTS = [
  {
    platform: "LINKEDIN" as const,
    content: `J'ai généré 0€ pendant 6 mois avec mon SaaS.

Puis j'ai fait UNE chose différente.

J'ai arrêté de construire des features.
J'ai commencé à appeler mes prospects.

30 appels en 2 semaines.
Résultat : 12 clients payants.
MRR : 4 200€.

Ce que j'ai appris :
→ Le produit n'est pas le problème
→ La distribution est tout
→ 1 conversation vaut 100 emails

Arrêtez de coder. Commencez à parler.`,
    authorName: "Thomas Marchal",
    authorHandle: "thomas-marchal",
    likes: 3847,
    comments: 412,
    shares: 298,
    views: 87400,
    viralScore: 7821,
    postUrl: "https://www.linkedin.com/posts/thomas-marchal-saas-founder_demo-001",
    niche: "SaaS",
    country: "France",
    hookType: "CONFESSION" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `7 outils IA que j'utilise chaque matin (et qui me font gagner 3h/jour) :

1. Claude — rédaction & analyse
2. Perplexity — recherche en temps réel
3. Notion AI — synthèse de réunions
4. Midjourney — visuels marketing
5. Whisper — transcription audio
6. Make.com — automatisations
7. Gamma — présentations en 5 min

Total : 127€/mois
Temps gagné : ~15h/semaine
ROI : immédiat

Lequel vous utilisez déjà ?`,
    authorName: "Sophie Renard",
    authorHandle: "sophie-renard-ia",
    likes: 5621,
    comments: 834,
    shares: 612,
    views: 143000,
    viralScore: 12840,
    postUrl: "https://www.linkedin.com/posts/sophie-renard-ia-outils_demo-002",
    niche: "marketing digital",
    country: "France",
    hookType: "LIST" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `Personne ne vous dit la vérité sur le personal branding.

Ce n'est PAS une question de followers.
Ce n'est PAS une question de likes.

C'est une question de confiance.

J'ai 12 000 abonnés.
Mon concurrent en a 180 000.

Il fait 20K€/mois.
Je fais 85K€/mois.

Pourquoi ?

Parce que mes 12 000 abonnés savent exactement ce que je fais, pour qui et comment les aider.

Niche = richesse.
Généraliste = invisibilité.

Spécialisez-vous. Osez décevoir 80% des gens pour servir les 20% qui ont vraiment besoin de vous.`,
    authorName: "Maxime Dupont",
    authorHandle: "maxime-dupont-branding",
    likes: 7203,
    comments: 956,
    shares: 445,
    views: 198000,
    viralScore: 18900,
    postUrl: "https://www.linkedin.com/posts/maxime-dupont-personal-brand_demo-003",
    niche: "personal branding",
    country: "France",
    hookType: "CONTRARIAN" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `Comment passer de 0 à 10K€/mois en freelance en 90 jours ?

Étape 1 (Jours 1-30) : Choisir une niche ultra-précise
→ Pas "consultant marketing"
→ Oui "je génère des leads B2B pour les SaaS €1M-€10M ARR"

Étape 2 (Jours 31-60) : Prouver votre valeur gratuitement
→ 5 case studies détaillés
→ 1 résultat mesurable par case study

Étape 3 (Jours 61-90) : Prospection ciblée
→ 20 messages LinkedIn personnalisés/jour
→ Taux de réponse cible : 15%

J'ai suivi cette méthode.
Résultat au 91ème jour : 11 200€ de contrats signés.

Sauvegardez ce post. Vous en aurez besoin.`,
    authorName: "Laura Petit",
    authorHandle: "laura-petit-freelance",
    likes: 4190,
    comments: 623,
    shares: 387,
    views: 112000,
    viralScore: 10240,
    postUrl: "https://www.linkedin.com/posts/laura-petit-freelance-growth_demo-004",
    niche: "entrepreneuriat",
    country: "France",
    hookType: "HOW_TO" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `Il y a 3 ans, j'ai tout quitté pour lancer ma startup.

Mon entourage m'a dit : "Tu es fou."
Mon patron m'a dit : "Tu vas regretter."
Ma banque m'a dit : "Non."

Aujourd'hui :
✓ 48 employés
✓ 2,3M€ de CA annuel
✓ Levée de 800K€

Je ne partage pas ça pour me vanter.

Je partage ça parce que si vous avez une idée qui vous tient éveillé la nuit, ce n'est pas de la folie.

C'est peut-être le début de quelque chose.`,
    authorName: "Antoine Bernard",
    authorHandle: "antoine-bernard-ceo",
    likes: 9840,
    comments: 1243,
    shares: 876,
    views: 267000,
    viralScore: 24670,
    postUrl: "https://www.linkedin.com/posts/antoine-bernard-startup_demo-005",
    niche: "startup",
    country: "France",
    hookType: "STORY" as const,
  },
  {
    platform: "TWITTER" as const,
    content: `94% des startups échouent dans les 3 premières années.

Voici les 5 vraies raisons (pas celles qu'on vous dit) :

1. Produit sans marché (pas de validation)
2. Équipe fondatrice incompatible
3. Burn rate trop élevé en phase early
4. Croissance avant rentabilité
5. Pivot trop tard (ou trop tôt)

Thread 🧵`,
    authorName: "Pierre Martin",
    authorHandle: "pierremartin_vc",
    likes: 2840,
    comments: 318,
    shares: 1240,
    views: 89000,
    viralScore: 8920,
    postUrl: "https://twitter.com/pierremartin_vc/status/demo-006",
    niche: "startup",
    country: "France",
    hookType: "STAT" as const,
  },
  {
    platform: "TWITTER" as const,
    content: `Combien de temps faut-il pour construire un SaaS rentable solo ?

J'ai interviewé 50 indie hackers.

Résultat moyen : 18 mois.

Mais voici ce qui change tout :
- Ceux qui ont validé avant de coder : 9 mois
- Ceux qui ont codé d'abord : 26 mois

Validez. Toujours.`,
    authorName: "Julie Moreau",
    authorHandle: "juliemoreau_build",
    likes: 3210,
    comments: 287,
    shares: 890,
    views: 67000,
    viralScore: 7480,
    postUrl: "https://twitter.com/juliemoreau_build/status/demo-007",
    niche: "SaaS",
    country: "France",
    hookType: "QUESTION" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `La productivité n'est pas une question de temps.

C'est une question d'énergie.

J'ai testé pendant 6 mois :
→ Lever à 5h ✓
→ Bloquer le calendrier ✓
→ Désactiver les notifs ✓
→ Deep work 4h/jour ✓

Résultat : +40% de output.

Mais le vrai game changer ?

Identifier mes 3 tâches à haute valeur et ignorer tout le reste.

80% de ce que vous faites ne produit que 20% de vos résultats.

Qu'est-ce que vous allez supprimer de votre agenda cette semaine ?`,
    authorName: "Nicolas Leblanc",
    authorHandle: "nicolas-leblanc-prod",
    likes: 6102,
    comments: 743,
    shares: 521,
    views: 158000,
    viralScore: 14580,
    postUrl: "https://www.linkedin.com/posts/nicolas-leblanc-productivite_demo-008",
    niche: "productivité",
    country: "France",
    hookType: "CONTRARIAN" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `En 2020, j'avais 200€ sur mon compte.

J'ai investi 180€ dans une formation copywriting.

3 ans plus tard :
→ Agence à 40K€/mois
→ 8 clients récurrents
→ Équipe de 4 personnes

Le copywriting m'a sauvé.

Parce que savoir ÉCRIRE pour VENDRE est la compétence la plus sous-estimée du 21ème siècle.

Peu importe votre secteur.
Peu importe votre produit.

Si vous ne savez pas communiquer votre valeur, personne ne vous paiera.

Investissez dans l'écriture. Toujours.`,
    authorName: "Camille Rousseau",
    authorHandle: "camille-rousseau-copy",
    likes: 8931,
    comments: 1102,
    shares: 734,
    views: 231000,
    viralScore: 22100,
    postUrl: "https://www.linkedin.com/posts/camille-rousseau-copywriting_demo-009",
    niche: "marketing digital",
    country: "France",
    hookType: "STORY" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `Dans 5 ans, 50% des emplois actuels n'existeront plus.

Ce n'est pas une prédiction catastrophiste.
C'est déjà en train de se passer.

Les métiers qui disparaissent :
✗ Secrétariat administratif
✗ Comptabilité de base
✗ Service client niveau 1
✗ Traduction simple
✗ Rédaction de contenu générique

Les métiers qui explosent :
✓ Prompt engineering
✓ AI trainer
✓ Data storytelling
✓ Automatisation no-code
✓ Cybersécurité

Votre plan pour les 12 prochains mois ?`,
    authorName: "Éric Fontaine",
    authorHandle: "eric-fontaine-futur",
    likes: 11240,
    comments: 1876,
    shares: 1023,
    views: 312000,
    viralScore: 31200,
    postUrl: "https://www.linkedin.com/posts/eric-fontaine-futur-travail_demo-010",
    niche: "leadership",
    country: "France",
    hookType: "PREDICTION" as const,
  },
  {
    platform: "TWITTER" as const,
    content: `J'ai analysé les 100 threads Twitter les plus viraux de 2024.

Voici la structure qui revient à 87% :

1. Hook chiffré ou provocateur
2. Promesse claire en 1 ligne
3. 5-7 points actionnables
4. Preuve sociale (résultat personnel)
5. CTA simple

Copiez cette structure. Adaptez le contenu.

Le format bat l'originalité à chaque fois.`,
    authorName: "Marie Girard",
    authorHandle: "mariegirard_content",
    likes: 4560,
    comments: 412,
    shares: 2100,
    views: 134000,
    viralScore: 15840,
    postUrl: "https://twitter.com/mariegirard_content/status/demo-011",
    niche: "personal branding",
    country: "France",
    hookType: "STAT" as const,
  },
  {
    platform: "LINKEDIN" as const,
    content: `Growth hacking : le terme est usé.

La méthode, elle, fonctionne toujours.

Notre croissance en 6 mois :
→ Mois 1 : 0 → 120 utilisateurs (bêta fermée, bouche-à-oreille)
→ Mois 2 : 120 → 480 (referral program x4)
→ Mois 3 : 480 → 1 900 (Product Hunt #2 du jour)
→ Mois 4 : 1 900 → 5 400 (article viral HN)
→ Mois 5 : 5 400 → 12 000 (partenariat newsletter 80K)
→ Mois 6 : 12 000 → 31 000 (TikTok organique)

Chaque canal a été testé, mesuré, scalé ou abandonné.

Le secret : itérer vite. Tuer les losers. Doubler les winners.`,
    authorName: "Hugo Lambert",
    authorHandle: "hugo-lambert-growth",
    likes: 7845,
    comments: 987,
    shares: 678,
    views: 201000,
    viralScore: 19870,
    postUrl: "https://www.linkedin.com/posts/hugo-lambert-growth-hacking_demo-012",
    niche: "growth hacking",
    country: "France",
    hookType: "STAT" as const,
  },
];

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const existing = await prisma.viralPost.count();
  if (existing >= 5) {
    return NextResponse.json({ message: `Déjà ${existing} posts en base — seed ignoré`, seeded: 0 });
  }

  const now = new Date();
  let seeded = 0;

  for (const post of SEED_POSTS) {
    const postedAt = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    try {
      await prisma.viralPost.upsert({
        where: { postUrl: post.postUrl },
        update: {},
        create: { ...post, postedAt },
      });
      seeded++;
    } catch {
      // already exists
    }
  }

  return NextResponse.json({ message: `${seeded} posts viraux ajoutés`, seeded });
}
