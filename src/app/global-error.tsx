"use client";

/**
 * Boundary d'erreur global — intercepte les erreurs non gérées (y compris dans le root layout).
 * Doit définir son propre <html> et <body> car il remplace tout le layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6 font-sans antialiased">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/20 flex items-center justify-center">
            <span className="text-3xl" aria-hidden>⚠️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Une erreur est survenue
          </h1>
          <p className="text-gray-500 text-sm">
            Skalle a rencontré un problème inattendu. Réessayez ou revenez plus tard.
          </p>
          {typeof window !== "undefined" && !window.location.hostname.includes("localhost") && (
            <p className="text-gray-400 text-xs text-left bg-gray-50 rounded-lg p-3">
              En production, vérifiez les variables d&apos;environnement dans Vercel (DATABASE_URL,
              AUTH_SECRET, NEXTAUTH_URL) et les logs du déploiement.
            </p>
          )}
          {process.env.NODE_ENV === "development" && (
            <pre className="text-left text-xs text-red-600 bg-gray-50 p-4 rounded-lg overflow-auto max-h-32">
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
          >
            Réessayer
          </button>
          <p className="text-gray-400 text-xs">
            <a href="/" className="underline hover:text-gray-600">Retour à l&apos;accueil</a>
          </p>
        </div>
      </body>
    </html>
  );
}
