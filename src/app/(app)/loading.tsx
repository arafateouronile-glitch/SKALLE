/**
 * Chargement pour la zone app (dashboard).
 */
export default function AppLoading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 animate-pulse" />
        <p className="text-sm text-gray-500">Chargement...</p>
      </div>
    </div>
  );
}
