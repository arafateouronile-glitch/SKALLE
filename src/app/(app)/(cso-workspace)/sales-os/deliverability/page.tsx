"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  ShieldCheck, ShieldX, Shield, AlertTriangle, CheckCircle2,
  Loader2, Search, Info, ChevronDown, ChevronUp, Zap, Clock,
  Mail, TrendingUp, ExternalLink, RefreshCw,
} from "lucide-react";
import type { DeliverabilityCheckResult } from "@/app/api/deliverability/check/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  if (grade === "A") return { fg: "#22c55e", bg: "rgba(34,197,94,0.15)", label: "Excellent" };
  if (grade === "B") return { fg: "#84cc16", bg: "rgba(132,204,22,0.15)", label: "Bon" };
  if (grade === "C") return { fg: "#f59e0b", bg: "rgba(245,158,11,0.15)", label: "Moyen" };
  if (grade === "D") return { fg: "#f97316", bg: "rgba(249,115,22,0.15)", label: "Faible" };
  return { fg: "#ef4444", bg: "rgba(239,68,68,0.15)", label: "Critique" };
}

function StatusIcon({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#22c55e" }} />;
  if (warn) return <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "#f59e0b" }} />;
  return <ShieldX className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />;
}

function ScoreArc({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ * 0.75;
  const gap = circ - dash;
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";
  const { fg } = gradeColor(grade);

  return (
    <svg width="140" height="100" viewBox="-10 -10 160 120">
      {/* Track */}
      <circle
        cx="70" cy="70" r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"
        strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
        strokeLinecap="round"
        transform="rotate(135 70 70)"
      />
      {/* Progress */}
      <circle
        cx="70" cy="70" r={r}
        fill="none" stroke={fg} strokeWidth="10"
        strokeDasharray={`${dash} ${gap + circ * 0.25}`}
        strokeLinecap="round"
        transform="rotate(135 70 70)"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x="70" y="66" textAnchor="middle" fill="white" fontSize="26" fontWeight="700">{score}</text>
      <text x="70" y="84" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">/100</text>
    </svg>
  );
}

// ─── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({
  label, ok, warn, detail, issues, extra,
}: {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
  issues?: string[];
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = (issues && issues.length > 0) || extra;

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: ok ? "rgba(34,197,94,0.2)" : warn ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)", background: "var(--bg-card)" }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <StatusIcon ok={ok} warn={warn} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{label}</p>
          {detail && (
            <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: "var(--fg-mute)" }}>{detail}</p>
          )}
        </div>
        {hasDetails && (
          <button onClick={() => setOpen((v) => !v)} className="p-1 rounded transition-all hover:bg-white/[0.06]" style={{ color: "var(--fg-mute)" }}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {open && hasDetails && (
        <div className="px-4 pb-3 pt-0 space-y-2 border-t border-white/[0.05]">
          {issues?.map((issue, i) => (
            <p key={i} className="text-[12px] flex items-start gap-2" style={{ color: warn ? "#fbbf24" : "#f87171" }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {issue}
            </p>
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}

// ─── Warmup guide ─────────────────────────────────────────────────────────────

function WarmupGuide() {
  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <h3 className="text-[13px] font-bold" style={{ color: "var(--fg)" }}>Guide de warmup email</h3>
      </div>
      <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
        Un nouveau domaine ou une nouvelle adresse doit être chauffée progressivement pour éviter d'atterrir en spam.
      </p>

      {/* Volume ramp */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Volume recommandé</p>
        {[
          { week: "Semaine 1", vol: "20–30 emails/jour", note: "Envoyez à vos vrais contacts d'abord" },
          { week: "Semaine 2", vol: "50–80 emails/jour", note: "Mélangez cold + warm outreach" },
          { week: "Semaine 3", vol: "100–150 emails/jour", note: "Surveillez le taux de bounce < 2%" },
          { week: "Semaine 4+", vol: "200+ emails/jour", note: "Augmentez si réputation stable" },
        ].map((row) => (
          <div key={row.week} className="flex items-center gap-3 py-2 rounded-lg px-3"
            style={{ background: "var(--bg-2)" }}>
            <Clock className="h-3.5 w-3.5 shrink-0 text-violet-400" />
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{row.week}</span>
              <span className="text-[11px] ml-2" style={{ color: "var(--fg-mute)" }}>{row.note}</span>
            </div>
            <span className="text-[11px] font-bold text-violet-400 shrink-0">{row.vol}</span>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Checklist avant envoi</p>
        {[
          "SPF, DKIM et DMARC configurés (voir ci-dessus)",
          "Ratio texte/image > 60/40 dans les emails",
          "Lien de désinscription présent",
          "Pas d'URL raccourcies (bit.ly, etc.)",
          "Objet < 50 caractères, pas de MAJUSCULES excessives",
          "Nom d'expéditeur = prénom réel (pas 'noreply')",
          "Taux bounce < 2% · Taux spam < 0.1%",
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--fg-dim)" }}>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
            {item}
          </div>
        ))}
      </div>

      {/* External tools */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Outils de warmup recommandés</p>
        {[
          { name: "Mailreach", desc: "Warmup auto + scoring réputation", url: "https://mailreach.co" },
          { name: "Warmbox", desc: "Réseau warmup 45k+ boîtes réelles", url: "https://warmbox.ai" },
          { name: "Instantly Warmup", desc: "Inclus dans Instantly.ai", url: "https://instantly.ai" },
          { name: "Google Postmaster", desc: "Stats réputation domaine Gmail (gratuit)", url: "https://postmaster.google.com" },
        ].map((tool) => (
          <a key={tool.name} href={tool.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between p-2.5 rounded-lg transition-all hover:brightness-110"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{tool.name}</p>
              <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{tool.desc}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliverabilityPage() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeliverabilityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck(d?: string) {
    const target = (d ?? domain).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deliverability/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: target }),
      });
      const data = await res.json() as DeliverabilityCheckResult & { error?: string };
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      setResult(data);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  const grade = result ? gradeColor(result.grade) : null;

  const QUICK_DOMAINS = ["gmail.com", "outlook.com", "yahoo.fr"];

  return (
    <>
      <AppTopBar title="Délivrabilité" breadcrumb="sales-os / délivrabilité" accent="violet" />

      <div className="p-6 max-w-[960px] space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-[16px] font-bold mb-1" style={{ color: "var(--fg)" }}>
            Analyse de délivrabilité email
          </h2>
          <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>
            Vérifiez SPF, DKIM, DMARC et MX de votre domaine d'envoi — les 4 piliers de la réputation email.
          </p>
        </div>

        {/* Domain input */}
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
          <label className="text-[12px] font-semibold" style={{ color: "var(--fg-mute)" }}>
            Domaine d&apos;envoi (ex : votreentreprise.com)
          </label>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-[10px]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}>
              <Mail className="h-4 w-4 shrink-0" style={{ color: "var(--fg-mute)" }} />
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runCheck()}
                placeholder="votreentreprise.com"
                className="flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: "var(--fg)" }}
              />
            </div>
            <button
              onClick={() => runCheck()}
              disabled={loading || !domain.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all disabled:opacity-40 hover:brightness-110"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Analyser
            </button>
          </div>

          {/* Quick test domains */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Tester :</span>
            {QUICK_DOMAINS.map((d) => (
              <button key={d} onClick={() => { setDomain(d); runCheck(d); }}
                className="text-[11px] px-2.5 py-1 rounded-full transition-all hover:brightness-110"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[12px]"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--violet-fg)" }} />
            <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>Analyse des enregistrements DNS…</p>
            <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>SPF · DKIM (18 sélecteurs) · DMARC · MX</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-5">

            {/* Score + grade card */}
            <div className="rounded-2xl p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex flex-col items-center">
                  <ScoreArc score={result.score} />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[22px] font-black" style={{ color: grade!.fg }}>{result.grade}</span>
                    <span className="text-[13px] font-semibold" style={{ color: grade!.fg }}>{grade!.label}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[200px] space-y-3">
                  <div>
                    <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{result.domain}</p>
                    <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                      Analysé le {new Date(result.checkedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {/* Mini breakdown */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "SPF", ok: result.spf.found && result.spf.valid, partial: result.spf.found && !result.spf.valid, pts: 25 },
                      { label: "DKIM", ok: result.dkim.found, partial: false, pts: 35 },
                      { label: "DMARC", ok: result.dmarc.found && result.dmarc.policy !== "none", partial: result.dmarc.found, pts: 30 },
                      { label: "MX", ok: result.mx.found, partial: false, pts: 10 },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: "var(--bg-2)" }}>
                        <StatusIcon ok={item.ok} warn={item.partial} />
                        <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{item.label}</span>
                        <span className="text-[10px] ml-auto" style={{ color: "var(--fg-mute)" }}>/{item.pts}pts</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => runCheck()} className="flex items-center gap-1.5 text-[11px] transition-all hover:brightness-110"
                    style={{ color: "var(--fg-mute)" }}>
                    <RefreshCw className="h-3 w-3" /> Relancer l&apos;analyse
                  </button>
                </div>
              </div>
            </div>

            {/* Detailed checks */}
            <div className="space-y-3">
              <h3 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>
                Détail des vérifications
              </h3>

              {/* SPF */}
              <CheckRow
                label={`SPF ${result.spf.found ? (result.spf.valid ? "✓ Configuré" : "⚠ Présent avec erreurs") : "✗ Manquant"}`}
                ok={result.spf.found && result.spf.valid}
                warn={result.spf.found && !result.spf.valid}
                detail={result.spf.record}
                issues={result.spf.issues}
              />

              {/* DKIM */}
              <CheckRow
                label={`DKIM ${result.dkim.found ? `✓ Trouvé (${result.dkim.selectors.length} sélecteur${result.dkim.selectors.length > 1 ? "s" : ""})` : "✗ Manquant"}`}
                ok={result.dkim.found}
                detail={result.dkim.selectors.map((s) => s.selector).join(", ") || undefined}
                issues={result.dkim.issues}
                extra={result.dkim.selectors.length > 0 ? (
                  <div className="space-y-1">
                    {result.dkim.selectors.map((s) => (
                      <div key={s.selector} className="text-[11px] font-mono truncate" style={{ color: "var(--fg-mute)" }}>
                        {s.selector}._domainkey : {s.value?.substring(0, 60)}…
                      </div>
                    ))}
                  </div>
                ) : undefined}
              />

              {/* DMARC */}
              <CheckRow
                label={`DMARC ${result.dmarc.found ? `✓ p=${result.dmarc.policy}` : "✗ Manquant"}`}
                ok={result.dmarc.found && result.dmarc.policy !== "none"}
                warn={result.dmarc.found && result.dmarc.policy === "none"}
                detail={result.dmarc.record}
                issues={result.dmarc.issues}
              />

              {/* MX */}
              <CheckRow
                label={`MX ${result.mx.found ? `✓ ${result.mx.records.length} serveur${result.mx.records.length > 1 ? "s" : ""}` : "✗ Aucun enregistrement MX"}`}
                ok={result.mx.found}
                detail={result.mx.records.join(" · ")}
                issues={result.mx.issues}
              />
            </div>

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>
                  Recommandations
                </h3>
                {result.recommendations.map((rec, i) => {
                  const colors = {
                    critical: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", fg: "#f87171", icon: ShieldX },
                    warning:  { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", fg: "#fbbf24", icon: AlertTriangle },
                    info:     { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.25)", fg: "#818cf8", icon: Info },
                  }[rec.severity];
                  const Icon = colors.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl"
                      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                      <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: colors.fg }} />
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>{rec.text}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Score context */}
            {result.score === 100 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-emerald-400">Authentification parfaite</p>
                  <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
                    SPF, DKIM et DMARC correctement configurés. Concentrez-vous sur le warmup progressif et la qualité du contenu.
                  </p>
                </div>
              </div>
            )}

            {/* Industry benchmarks */}
            <div className="rounded-2xl p-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-violet-400" />
                <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Benchmarks secteur (2025)</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Taux d'ouverture moyen", value: "38–45%", note: "Cold outreach B2B" },
                  { label: "Taux de réponse moyen", value: "8–12%", note: "Cold email qualifié" },
                  { label: "Taux de bounce max", value: "< 2%", note: "Au-delà = risque" },
                  { label: "Taux spam max", value: "< 0.1%", note: "Seuil Google/Yahoo" },
                ].map((b) => (
                  <div key={b.label} className="text-center p-3 rounded-lg"
                    style={{ background: "var(--bg-2)" }}>
                    <p className="text-[16px] font-bold text-violet-400">{b.value}</p>
                    <p className="text-[11px] font-medium mt-0.5" style={{ color: "var(--fg)" }}>{b.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{b.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Always show warmup guide */}
        {!loading && <WarmupGuide />}

      </div>
    </>
  );
}
