"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getGodModeStats,
  getGodModeWorkspaces,
  getGodModeErrorLogs,
  adminAddCredits,
  adminSuspendUser,
} from "@/actions/god-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DollarSign,
  Layout,
  Zap,
  Users,
  FileText,
  AlertTriangle,
  Loader2,
  Plus,
  Ban,
  CheckCircle,
} from "lucide-react";

type Stats = {
  mrr: number;
  workspacesTotal: number;
  workspacesActive: number;
  creditsBurned30d: number;
  leadsTotal: number;
  articlesTotal: number;
  creditsByDay: Array<{ date: string; credits: number }>;
};

type WorkspaceRow = {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  plan: string;
  credits: number;
  suspendedAt: Date | null;
  updatedAt: Date;
};

type ErrorLog = {
  id: string;
  workspaceId: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: Date;
};

export default function GodModePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [creditsModal, setCreditsModal] = useState<{ ownerId: string; email: string } | null>(null);
  const [creditsAmount, setCreditsAmount] = useState("50");
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [suspendLoading, setSuspendLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, w, l] = await Promise.all([
          getGodModeStats(),
          getGodModeWorkspaces(),
          getGodModeErrorLogs(),
        ]);
        setStats(s);
        setWorkspaces(w);
        setLogs(l);
      } catch {
        // 404 handled by layout
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleAddCredits = async () => {
    if (!creditsModal) return;
    const amount = parseInt(creditsAmount, 10);
    if (isNaN(amount) || amount < 1) {
      toast.error("Montant invalide");
      return;
    }
    setCreditsLoading(true);
    const res = await adminAddCredits(creditsModal.ownerId, amount);
    setCreditsLoading(false);
    if (res.success) {
      toast.success(`${amount} crédits ajoutés`);
      setCreditsModal(null);
      getGodModeStats().then(setStats);
      getGodModeWorkspaces().then(setWorkspaces);
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleSuspend = async (ownerId: string, suspend: boolean) => {
    setSuspendLoading(ownerId);
    const res = await adminSuspendUser(ownerId, suspend);
    setSuspendLoading(null);
    if (res.success) {
      toast.success(suspend ? "Compte suspendu" : "Compte réactivé");
      getGodModeWorkspaces().then(setWorkspaces);
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const formatDate = (d: Date) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-gray-300 p-6 font-mono text-sm">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="border border-white/10 rounded-lg p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-emerald-400 tracking-tight">
            GOD MODE — Super-Admin
          </h1>
          <span className="text-xs text-white/50">Tour de contrôle Skalle</span>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-white/60 mb-1">
              <DollarSign className="h-4 w-4" />
              <span>MRR estimé</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats.mrr} €</p>
          </div>
          <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-white/60 mb-1">
              <Layout className="h-4 w-4" />
              <span>Workspaces</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.workspacesActive} / {stats.workspacesTotal}
            </p>
            <p className="text-xs text-white/50">actifs / total</p>
          </div>
          <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-white/60 mb-1">
              <Zap className="h-4 w-4" />
              <span>Crédits brûlés (30j)</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{stats.creditsBurned30d}</p>
          </div>
          <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-white/60 mb-1">
              <Users className="h-4 w-4" />
              <span>Leads (CSO)</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.leadsTotal}</p>
          </div>
          <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-white/60 mb-1">
              <FileText className="h-4 w-4" />
              <span>Articles (CMO)</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.articlesTotal}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="border border-white/10 rounded-lg p-4 bg-white/[0.02]">
          <h2 className="text-emerald-400 font-semibold mb-4">Consommation crédits (14 derniers jours)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.creditsByDay.map((d) => ({ ...d, label: d.date.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }}
                  labelStyle={{ color: "#10b981" }}
                />
                <Bar dataKey="credits" fill="#10b981" radius={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Workspaces table */}
        <div className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]">
          <h2 className="text-emerald-400 font-semibold p-4 border-b border-white/10">
            Workspaces — Vue globale
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-white/60 text-xs uppercase">
                  <th className="p-3">Nom</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Crédits</th>
                  <th className="p-3">Dernière activité</th>
                  <th className="p-3">Admin</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((w) => (
                  <tr key={w.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="p-3">{w.name}</td>
                    <td className="p-3 text-white/80">{w.ownerEmail}</td>
                    <td className="p-3">{w.plan}</td>
                    <td className="p-3">{w.credits}</td>
                    <td className="p-3 text-white/60">{formatDate(w.updatedAt)}</td>
                    <td className="p-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-white/10 h-8 text-xs"
                        onClick={() => setCreditsModal({ ownerId: w.ownerId, email: w.ownerEmail })}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Crédits
                      </Button>
                      {w.suspendedAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-emerald-400 hover:bg-emerald-500/10 border border-white/10 h-8 text-xs"
                          onClick={() => handleSuspend(w.ownerId, false)}
                          disabled={suspendLoading === w.ownerId}
                        >
                          {suspendLoading === w.ownerId ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                          Réactiver
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-white/10 h-8 text-xs"
                          onClick={() => handleSuspend(w.ownerId, true)}
                          disabled={suspendLoading === w.ownerId}
                        >
                          {suspendLoading === w.ownerId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3 mr-1" />}
                          Suspendre
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Error logs */}
        <div className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]">
          <h2 className="text-amber-400 font-semibold p-4 border-b border-white/10 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Logs d&apos;erreurs (50 derniers)
          </h2>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-black/90">
                <tr className="border-b border-white/10 text-white/60 text-xs uppercase">
                  <th className="p-3">Date</th>
                  <th className="p-3">Workspace</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Erreur</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-white/50 text-center">
                      Aucune erreur récente
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="p-3 text-white/60 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                      <td className="p-3 font-mono text-xs">{log.workspaceId.slice(0, 8)}…</td>
                      <td className="p-3">{log.type}</td>
                      <td className="p-3 text-red-400/90 max-w-xs truncate" title={log.error ?? ""}>
                        {log.error ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Add Credits */}
      <Dialog open={!!creditsModal} onOpenChange={(open) => !open && setCreditsModal(null)}>
        <DialogContent className="bg-black border-white/10 text-gray-300">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Ajouter des crédits</DialogTitle>
          </DialogHeader>
          {creditsModal && (
            <>
              <p className="text-sm text-white/70">{creditsModal.email}</p>
              <div className="space-y-2">
                <Label className="text-white/70">Montant</Label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreditsModal(null)} className="border-white/10">
                  Annuler
                </Button>
                <Button
                  onClick={handleAddCredits}
                  disabled={creditsLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-black"
                >
                  {creditsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
