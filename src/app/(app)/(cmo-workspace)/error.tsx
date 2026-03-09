"use client";

export default function CMOError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 bg-gradient-to-br from-gray-50 via-white to-emerald-50/30">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-xl bg-red-500/10 flex items-center justify-center">
          <span className="text-2xl" aria-hidden>⚠️</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Erreur Marketing OS
        </h2>
        <p className="text-gray-500 text-sm">
          Une action (IA, API ou base de données) a échoué. Réessayez ou revenez au tableau de bord.
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
            href="/marketing-os"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Tableau de bord
          </a>
        </div>
      </div>
    </div>
  );
}
