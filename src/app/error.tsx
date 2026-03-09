"use client";

/**
 * Boundary d'erreur pour les segments sous le root layout.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-xl bg-red-500/10 flex items-center justify-center">
          <span className="text-2xl" aria-hidden>⚠️</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Une erreur est survenue
        </h2>
        <p className="text-gray-500 text-sm">
          Réessayez ou revenez à l&apos;accueil.
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-left text-xs text-red-600 bg-red-50 p-3 rounded-lg overflow-auto max-h-24">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}
