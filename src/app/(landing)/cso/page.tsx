import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Zap,
  ArrowRight,
  Users,
  MessageCircle,
  Target,
  BarChart3,
  Mail,
  Phone,
  CheckCircle,
  Clock,
} from "lucide-react";

export default function CsoLandingPage() {
  const upcomingFeatures = [
    {
      icon: Users,
      title: "Prospection LinkedIn IA",
      description:
        "Identifiez vos ICP, générez des séquences de messages hyper-personnalisées et automatisez votre outreach LinkedIn.",
    },
    {
      icon: Mail,
      title: "Cold Email Automation",
      description:
        "Campagnes email multi-étapes avec personnalisation IA, warm-up automatique et tracking des réponses.",
    },
    {
      icon: MessageCircle,
      title: "Social Prospector",
      description:
        "Transformez les interactions Instagram et Facebook en opportunités commerciales avec des DMs générés par l'IA.",
    },
    {
      icon: Target,
      title: "Lead Enrichment",
      description:
        "Enrichissez vos leads avec Apollo, Clay, Hunter et ZoomInfo. Emails et téléphones vérifiés automatiquement.",
    },
    {
      icon: Phone,
      title: "Scripts d'appel IA",
      description:
        "Générez des scripts d'appel et SMS personnalisés pour chaque prospect selon son profil et son industrie.",
    },
    {
      icon: BarChart3,
      title: "Pipeline & Analytics",
      description:
        "Suivez chaque prospect dans votre pipeline, analysez vos taux de conversion et optimisez vos séquences.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold text-white">Skalle</span>
                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  CSO
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/cmo" className="text-slate-400 hover:text-emerald-400 transition-colors">
                ← Skalle CMO
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" className="text-slate-300 hover:text-white">
                  Connexion
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero - Waitlist */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-sm mb-8">
            <Clock className="h-4 w-4" />
            Bientôt disponible — Rejoignez la waitlist
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Le{" "}
            <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              Sales OS
            </span>{" "}
            pour closer plus vite
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Prospection LinkedIn, cold email, enrichissement de leads et pipeline
            commercial. Tout ce dont votre équipe sales a besoin, propulsé par l&apos;IA.
          </p>

          {/* Waitlist Form */}
          <div className="max-w-md mx-auto">
            <div className="p-8 rounded-2xl bg-slate-900/80 border border-violet-500/30 backdrop-blur-xl">
              <h2 className="text-2xl font-bold text-white mb-2">
                Rejoindre la waitlist
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Soyez parmi les premiers à accéder à Skalle CSO.
              </p>
              <div className="space-y-3">
                <input
                  type="email"
                  placeholder="votre@email.com"
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <Button
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  size="lg"
                >
                  Rejoindre la waitlist
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-4 text-center">
                Aucun spam. Vous serez notifié en avant-première.
              </p>
            </div>
          </div>

          {/* Already have CMO? */}
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className="text-slate-400">
              Vous utilisez déjà{" "}
              <Link href="/cmo" className="text-emerald-400 hover:underline">
                Skalle CMO
              </Link>
              {" "}? Votre accès CSO sera automatiquement activé.
            </span>
          </div>
        </div>
      </section>

      {/* Upcoming Features */}
      <section className="py-20 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Ce qui arrive dans Skalle CSO
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Un Sales OS complet, construit pour les équipes qui veulent scaler
              leur acquisition client
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {upcomingFeatures.map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-violet-500/50 transition-all group relative overflow-hidden"
              >
                <div className="absolute top-3 right-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                    Bientôt
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center mb-4 group-hover:from-violet-500/30 group-hover:to-purple-500/30 transition-colors">
                  <feature.icon className="h-6 w-6 text-violet-400" />
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

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-white">Skalle CSO</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <a href="#" className="hover:text-white">Confidentialité</a>
              <a href="#" className="hover:text-white">CGU</a>
              <a href="#" className="hover:text-white">Contact</a>
              <Link href="/cmo" className="hover:text-emerald-400">Skalle CMO</Link>
            </div>
            <p className="text-sm text-slate-500">© 2026 Skalle. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
