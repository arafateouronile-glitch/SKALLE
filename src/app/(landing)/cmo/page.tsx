import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/pricing/pricing-table";
import {
  Zap,
  FileText,
  Image,
  BarChart3,
  ArrowRight,
  Check,
  Star,
  Sparkles,
  Globe,
  Target,
  Calendar,
  Brain,
} from "lucide-react";

export default function CmoLandingPage() {
  const features = [
    {
      icon: Target,
      title: "Discovery & Keywords",
      description:
        "Analysez vos concurrents, découvrez les meilleures opportunités SEO et identifiez les mots-clés à fort potentiel.",
    },
    {
      icon: FileText,
      title: "SEO Factory",
      description:
        "Générez jusqu'à 300 articles optimisés en un clic avec sources, images et métadonnées SEO complètes.",
    },
    {
      icon: Calendar,
      title: "Content Factory",
      description:
        "Transformez vos articles en threads X, posts LinkedIn et scripts TikTok. 30 concepts/mois générés par l'IA.",
    },
    {
      icon: Brain,
      title: "Ad-Intelligence",
      description:
        "Scrapez les meilleures publicités de vos concurrents et générez des briefs créatifs prêts à diffuser.",
    },
    {
      icon: Image,
      title: "Image Generator",
      description:
        "Créez des visuels professionnels pour vos ads et contenus directement depuis votre dashboard.",
    },
    {
      icon: Globe,
      title: "CMS Integration",
      description:
        "Publiez automatiquement sur WordPress et Shopify. Votre pipeline de contenu enfin automatisé.",
    },
  ];

  const testimonials = [
    {
      name: "Marie L.",
      role: "Fondatrice, StartupX",
      content:
        "Skalle CMO a transformé notre production de contenu. On génère maintenant 50 articles/mois en quelques clics.",
      rating: 5,
    },
    {
      name: "Thomas B.",
      role: "CMO, TechAgency",
      content:
        "L'Ad-Intelligence est incroyable. On reverse-engineer les pubs des concurrents et on génère nos briefs en 2 minutes.",
      rating: 5,
    },
    {
      name: "Sophie M.",
      role: "Freelance Marketing",
      content:
        "Je gère 10 clients avec Skalle CMO. L'automatisation me fait gagner 20h/semaine.",
      rating: 5,
    },
  ];

  const plans = [
    {
      name: "Free",
      price: "0€",
      features: ["100 crédits/mois", "5 articles SEO", "Audit basique"],
      popular: false,
    },
    {
      name: "Business",
      price: "99€",
      features: [
        "1 000 crédits",
        "100 articles SEO",
        "Intégration CMS",
        "Support prioritaire",
      ],
      popular: true,
    },
    {
      name: "Scale",
      price: "999€",
      features: [
        "25 000 crédits",
        "Articles illimités",
        "API access",
        "Support dédié",
      ],
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold text-gray-900">Skalle</span>
                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  CMO
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-500 hover:text-gray-900 transition-colors">
                Fonctionnalités
              </a>
              <a href="#pricing" className="text-gray-500 hover:text-gray-900 transition-colors">
                Tarifs
              </a>
              <Link href="/cso" className="text-gray-500 hover:text-emerald-400 transition-colors">
                Skalle CSO →
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" className="text-gray-700 hover:text-gray-900">
                  Connexion
                </Button>
              </Link>
              <Link href="/register">
                <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white">
                  Démarrer gratuitement
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm mb-8">
            <Sparkles className="h-4 w-4" />
            Marketing OS — Propulsé par GPT-4 & Claude
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Le{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Marketing OS
            </span>{" "}
            pour les équipes ambitieuses
          </h1>

          <p className="text-xl text-gray-500 max-w-3xl mx-auto mb-10">
            SEO automatisé, content marketing, ad-intelligence et publication CMS.
            Tout ce dont votre équipe marketing a besoin pour dominer votre marché.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-lg px-8"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="border-gray-300 text-gray-900 hover:bg-gray-100"
            >
              Voir la démo
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-gray-500">
            {[
              "Pas de carte requise",
              "100 crédits offerts",
              "Annulation facile",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "10K+", label: "Articles générés" },
              { value: "500+", label: "Entreprises" },
              { value: "98%", label: "Satisfaction" },
              { value: "40%", label: "Temps gagné" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-gray-500 mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Une suite complète d&apos;outils marketing
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              Tout ce dont vous avez besoin pour automatiser et scaler votre
              marketing digital
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-gray-50 border border-gray-200 hover:border-emerald-500/50 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4 group-hover:from-emerald-500/30 group-hover:to-teal-500/30 transition-colors">
                  <feature.icon className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="py-20 px-4 bg-gradient-to-b from-gray-50 to-white"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Tarifs simples et transparents
            </h2>
            <p className="text-xl text-gray-500">
              Commencez gratuitement, évoluez selon vos besoins
            </p>
          </div>
          <PricingTable variant="landing" />
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Ils nous font confiance
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-gray-50 border border-gray-200"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star key={j} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-4">&quot;{testimonial.content}&quot;</p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-r from-emerald-900/50 to-teal-900/50 border border-emerald-500/30">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Prêt à automatiser votre marketing ?
            </h2>
            <p className="text-xl text-gray-700 mb-8">
              Rejoignez plus de 500 entreprises qui utilisent Skalle CMO
            </p>
            <Link href="/register">
              <Button
                size="lg"
                className="bg-white text-emerald-900 hover:bg-gray-100 text-lg px-8"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-gray-900">Skalle CMO</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link href="/privacy" className="hover:text-gray-900">Confidentialité</Link>
              <Link href="/cgu" className="hover:text-gray-900">CGU</Link>
              <a href="#" className="hover:text-gray-900">Contact</a>
              <Link href="/cso" className="hover:text-emerald-400">Skalle CSO</Link>
            </div>
            <p className="text-sm text-gray-400">© 2026 Skalle. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
