import { PricingTable } from "@/components/pricing/pricing-table";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Tarification — Skalle",
  description: "Des tarifs transparents alignés avec votre usage. Commencez gratuitement, évoluez selon vos besoins.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-12 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>

        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Tarification transparente
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Alignée avec votre usage. Pas d&apos;abonnement caché, pas de mauvaise surprise.
            Commencez gratuitement, évoluez quand vous en avez besoin.
          </p>
        </div>

        {/* Pricing table */}
        <PricingTable variant="landing" />

        {/* Top-up mention */}
        <div className="mt-10 text-center">
          <p className="text-slate-400 text-sm">
            Besoin de crédits ponctuels ?{" "}
            <span className="text-emerald-400 font-medium">
              Top-up disponible dans les paramètres — 500 crédits pour 19 €
            </span>
            , sans changer de plan.
          </p>
        </div>
      </div>
    </div>
  );
}
