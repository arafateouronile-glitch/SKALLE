/**
 * État de chargement global (root).
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-emerald-50/30">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 animate-pulse" />
        <p className="text-sm text-gray-500">Chargement...</p>
      </div>
    </div>
  );
}
