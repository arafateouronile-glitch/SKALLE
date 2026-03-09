import Link from "next/link";

/**
 * Page 404 globale.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-linear-to-br from-gray-50 via-white to-emerald-50/30">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-6xl font-bold text-gray-200">404</p>
        <h1 className="text-xl font-semibold text-gray-900">
          Page introuvable
        </h1>
        <p className="text-gray-500 text-sm">
          L&apos;URL demandée n&apos;existe pas ou a été déplacée.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
