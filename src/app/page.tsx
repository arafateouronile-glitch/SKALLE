import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/pricing/pricing-table";
import {
  Zap,
  ArrowRight,
  Check,
  FileText,
  Image,
  Calendar,
  Target,
  MessageCircle,
  CreditCard,
  BarChart3,
  Sparkles,
  Play,
} from "lucide-react";
import { getLandingStats } from "@/actions/landing-stats";

export const dynamic = "force-dynamic";

export default async function SkalleEliteLandingPage() {
  const stats = await getLandingStats();

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">Skalle</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#choice" className="text-slate-400 hover:text-white transition-colors text-sm">
                CMO & CSO
              </a>
              <a href="#proof" className="text-slate-400 hover:text-white transition-colors text-sm">
                En direct
              </a>
              <a href="#pricing" className="text-slate-400 hover:text-white transition-colors text-sm">
                Tarifs
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800">
                  Connexion
                </Button>
              </Link>
              <Link href="/register">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Démarrer gratuitement
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <p className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-sm mb-8">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Équipe de direction marketing et commerciale, pilotée par l&apos;IA
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            L&apos;IA qui ne se contente pas d&apos;écrire, elle décide.
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto mb-10">
            Skalle orchestre votre SEO, vos réseaux sociaux et votre prospection commerciale 24h/24.
            Le premier agent marketing autonome pour PME ambitieuses.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/cmo">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-base px-8 py-6 rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40"
              >
                Essayer le CMO
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/cso">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-2 border-indigo-500/60 text-indigo-300 hover:bg-indigo-500/20 hover:text-white text-base px-8 py-6 rounded-xl transition-all"
              >
                Découvrir le CSO
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-slate-400 text-sm">
            {["Pas de carte requise", "100 crédits offerts", "Annulation facile"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Choice — Dual-Core Showcase */}
      <section id="choice" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
            Une seule plateforme, deux moteurs
          </h2>
          <p className="text-slate-400 text-center max-w-2xl mx-auto mb-12">
            Choisissez votre priorité : attirer (CMO) ou convertir (CSO).
          </p>
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* CMO Card */}
            <Link
              href="/cmo"
              className="group block p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-slate-900 to-emerald-950/30 border-2 border-slate-700 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
                  <FileText className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">Skalle CMO</h3>
              </div>
              <p className="text-xl font-semibold text-emerald-300 mb-4">
                Dominez Google et les réseaux sociaux.
              </p>
              <ul className="space-y-3 text-slate-300 text-sm sm:text-base">
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                  E-E-A-T et articles longs (3000+ mots)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                  Nano Banana : visuels pro générés par l&apos;IA
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                  Calendrier de contenu automatisé
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-400 shrink-0" />
                  SEO Factory, Discovery, Ad-Intelligence
                </li>
              </ul>
              <span className="inline-flex items-center gap-2 mt-6 text-emerald-400 font-medium group-hover:gap-3 transition-all">
                Essayer le CMO <ArrowRight className="h-5 w-5" />
              </span>
            </Link>

            {/* CSO Card */}
            <Link
              href="/cso"
              className="group block p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-950/30 border-2 border-slate-700 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
                  <Target className="h-8 w-8 text-indigo-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">Skalle CSO</h3>
              </div>
              <p className="text-xl font-semibold text-indigo-300 mb-4">
                Transformez vos interactions en revenus.
              </p>
              <ul className="space-y-3 text-slate-300 text-sm sm:text-base">
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-indigo-400 shrink-0" />
                  Lead Scoring : triez les leads chauds
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-indigo-400 shrink-0" />
                  Closing Agent : réponses qui convertissent
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-indigo-400 shrink-0" />
                  One-Click Checkout : lien Stripe en un clic
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-indigo-400 shrink-0" />
                  Social Prospector, Objection Bank
                </li>
              </ul>
              <span className="inline-flex items-center gap-2 mt-6 text-indigo-400 font-medium group-hover:gap-3 transition-all">
                Découvrir le CSO <ArrowRight className="h-5 w-5" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Live Demo / Preuve — Build in Public */}
      <section id="proof" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Build in Public
          </h2>
          <p className="text-slate-400 mb-2">
            En phase Bêta : chiffres réels, pas de faux témoignages.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 mt-10">
            <div className="px-6 py-4 rounded-2xl bg-slate-800/80 border border-slate-700">
              <p className="text-3xl sm:text-4xl font-bold text-emerald-400">
                {stats.articlesGenerated}
              </p>
              <p className="text-slate-400 text-sm sm:text-base mt-1">articles générés</p>
            </div>
            <div className="px-6 py-4 rounded-2xl bg-slate-800/80 border border-slate-700">
              <p className="text-3xl sm:text-4xl font-bold text-indigo-400">
                {stats.opportunitiesThisWeek}
              </p>
              <p className="text-slate-400 text-sm sm:text-base mt-1">opportunités cette semaine</p>
            </div>
          </div>
          <p className="text-slate-500 text-sm mt-6">
            L&apos;Agent Brain prend des décisions en continu ; les métriques sont mises à jour en temps réel.
          </p>
        </div>
      </section>

      {/* Transparent Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
            Tarification transparente
          </h2>
          <p className="text-slate-400 text-center mb-12">
            Alignée avec votre usage. Pas de mauvaise surprise.
          </p>
          <PricingTable variant="landing" />
        </div>
      </section>

      {/* CTA final */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Prêt à faire décider l&apos;IA pour vous ?
            </h2>
            <p className="text-slate-400 mb-8">
              Rejoignez les PME qui orchestrent leur marketing et leurs ventes avec Skalle.
            </p>
            <Link href="/register">
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-base px-8"
              >
                Démarrer gratuitement
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-white">Skalle</span>
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
            <Link href="/cmo" className="hover:text-emerald-400 transition-colors">CMO</Link>
            <Link href="/cso" className="hover:text-indigo-400 transition-colors">CSO</Link>
            <a href="#" className="hover:text-white transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-white transition-colors">CGU</a>
          </div>
          <p className="text-sm text-slate-500">© 2026 Skalle. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
