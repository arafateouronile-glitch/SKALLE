import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Zap,
  FileText,
  Users,
  Image,
  BarChart3,
  ArrowRight,
  Check,
  Star,
  Sparkles,
  Globe,
  Target,
  Calendar,
} from "lucide-react";

export default function HomePage() {
  const features = [
    {
      icon: Target,
      title: "Discovery",
      description:
        "Analysez vos concurrents et découvrez les meilleures opportunités SEO",
    },
    {
      icon: FileText,
      title: "SEO Factory",
      description:
        "Générez jusqu'à 300 articles optimisés en un clic avec sources et images",
    },
    {
      icon: Calendar,
      title: "Social Calendar",
      description:
        "Transformez vos articles en threads X, posts LinkedIn et scripts TikTok",
    },
    {
      icon: Users,
      title: "Prospection",
      description:
        "Séquences de messages LinkedIn personnalisées générées par l'IA",
    },
    {
      icon: Image,
      title: "Image Generator",
      description: "Créez des visuels professionnels pour vos ads et contenus",
    },
    {
      icon: Globe,
      title: "CMS Integration",
      description: "Publiez automatiquement sur WordPress et Shopify",
    },
  ];

  const testimonials = [
    {
      name: "Marie L.",
      role: "Fondatrice, StartupX",
      content:
        "Viral Trends a transformé notre production de contenu. On génère maintenant 50 articles/mois en quelques clics.",
      rating: 5,
    },
    {
      name: "Thomas B.",
      role: "CMO, TechAgency",
      content:
        "L'outil de prospection LinkedIn est incroyable. Nos taux de réponse ont augmenté de 40%.",
      rating: 5,
    },
    {
      name: "Sophie M.",
      role: "Freelance Marketing",
      content:
        "Je gère 10 clients avec Viral Trends. L'automatisation me fait gagner 20h/semaine.",
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
    <div className="min-h-screen bg-slate-950">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">Skalle</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-400 hover:text-white">
                Fonctionnalités
              </a>
              <a href="#pricing" className="text-slate-400 hover:text-white">
                Tarifs
              </a>
              <a
                href="#testimonials"
                className="text-slate-400 hover:text-white"
              >
                Témoignages
              </a>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button
                  variant="ghost"
                  className="text-slate-300 hover:text-white"
                >
                  Connexion
                </Button>
              </Link>
              <Link href="/register">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm mb-8">
            <Sparkles className="h-4 w-4" />
            Propulsé par GPT-4 & Claude 3.5
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Transformez votre site en{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              machine de guerre
            </span>{" "}
            marketing
          </h1>

          <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-10">
            SEO automatisé, prospection LinkedIn, génération d&apos;images et
            publication CMS. Tout ce dont vous avez besoin pour dominer votre
            marché.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg px-8"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              Voir la démo
            </Button>
          </div>

          <div className="mt-12 flex items-center justify-center gap-8 text-slate-400">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-400" />
              <span>Pas de carte requise</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-400" />
              <span>100 crédits offerts</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-400" />
              <span>Annulation facile</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "10K+", label: "Articles générés" },
              { value: "500+", label: "Entreprises" },
              { value: "98%", label: "Satisfaction" },
              { value: "40%", label: "Temps gagné" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-slate-400 mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Une suite complète d&apos;outils marketing
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Tout ce dont vous avez besoin pour automatiser et scaler votre
              marketing digital
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-purple-500/50 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4 group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-colors">
                  <feature.icon className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="py-20 px-4 bg-gradient-to-b from-slate-950 to-purple-950/20"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Tarifs simples et transparents
            </h2>
            <p className="text-xl text-slate-400">
              Commencez gratuitement, évoluez selon vos besoins
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`p-8 rounded-2xl ${
                  plan.popular
                    ? "bg-gradient-to-b from-purple-900/50 to-pink-900/50 border-2 border-purple-500 relative"
                    : "bg-slate-900/50 border border-slate-800"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 bg-purple-600 text-white text-sm font-medium rounded-full">
                      Plus populaire
                    </span>
                  </div>
                )}
                <h3 className="text-2xl font-bold text-white mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="text-slate-400">/mois</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li
                      key={j}
                      className="flex items-center gap-2 text-slate-300"
                    >
                      <Check className="h-5 w-5 text-green-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/register">
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-white text-purple-900 hover:bg-slate-100"
                        : "bg-slate-800 hover:bg-slate-700"
                    }`}
                  >
                    Démarrer
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Ils nous font confiance
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star
                      key={j}
                      className="h-5 w-5 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-slate-300 mb-4">
                  &quot;{testimonial.content}&quot;
                </p>
                <div>
                  <p className="font-semibold text-white">{testimonial.name}</p>
                  <p className="text-sm text-slate-400">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-r from-purple-900/50 to-pink-900/50 border border-purple-500/30">
            <h2 className="text-4xl font-bold text-white mb-4">
              Prêt à automatiser votre marketing ?
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Rejoignez plus de 500 entreprises qui utilisent Skalle
            </p>
            <Link href="/register">
              <Button
                size="lg"
                className="bg-white text-purple-900 hover:bg-slate-100 text-lg px-8"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-white">Skalle</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <a href="#" className="hover:text-white">
                Confidentialité
              </a>
              <a href="#" className="hover:text-white">
                CGU
              </a>
              <a href="#" className="hover:text-white">
                Contact
              </a>
            </div>
            <p className="text-sm text-slate-500">
              © 2026 Skalle. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
