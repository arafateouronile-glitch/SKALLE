import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Stripe (et autres paquets Node CJS) doit être résolu côté serveur sans bundling Turbopack
  serverExternalPackages: ["stripe"],

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  async redirects() {
    return [
      // ─── Redirections permanentes : ancienne structure → nouvelle ──────────
      {
        source: "/dashboard",
        destination: "/marketing-os",
        permanent: true,
      },
      {
        source: "/dashboard/:path*",
        destination: "/marketing-os/:path*",
        permanent: true,
      },
      // ─── Sprint 4 : ancien CMO tools → nouvelles pages unifiées ────────────
      { source: "/marketing-os/seo-factory", destination: "/marketing-os/studio", permanent: true },
      { source: "/marketing-os/seo-factory/:path*", destination: "/marketing-os/studio", permanent: true },
      { source: "/marketing-os/discovery", destination: "/marketing-os/spy", permanent: true },
      { source: "/marketing-os/discovery/:path*", destination: "/marketing-os/spy", permanent: true },
      { source: "/marketing-os/analytics", destination: "/marketing-os/insights", permanent: true },
      { source: "/marketing-os/analytics/:path*", destination: "/marketing-os/insights", permanent: true },
      // ─── Sprint 4 : ancien CSO tools → nouvelles pages unifiées ────────────
      { source: "/sales-os/crm", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/crm/:path*", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/reply-assistant", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/reply-assistant/:path*", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/sequences", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/sequences/:path*", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/signals-radar", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/signals-radar/:path*", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/local-radar", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/local-radar/:path*", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/newborn-radar", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/newborn-radar/:path*", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/partnerships", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/partnerships/:path*", destination: "/sales-os/hunt", permanent: true },
      { source: "/sales-os/agent", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/analytics", destination: "/sales-os/insights", permanent: true },
      { source: "/sales-os/analytics/:path*", destination: "/sales-os/insights", permanent: true },
      // ─── Redirections CMO → CSO : outils Sales migrés vers Sales OS ──────────
      {
        source: "/marketing-os/prospection",
        destination: "/sales-os/leads",
        permanent: true,
      },
      {
        source: "/marketing-os/prospection/:path*",
        destination: "/sales-os/leads",
        permanent: true,
      },
      {
        source: "/marketing-os/social-prospector",
        destination: "/sales-os/hunt",
        permanent: true,
      },
      {
        source: "/marketing-os/social-prospector/:path*",
        destination: "/sales-os/hunt",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // ── Source maps (uploadées à Sentry, supprimées du bundle final) ────────────
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Pas d'upload en dev (pas de token)
  silent: true,
  disableLogger: true,

  // Supprimer les source maps du déploiement après upload
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Tunnel pour contourner les bloqueurs de pub
  tunnelRoute: "/monitoring-tunnel",

  // Désactiver l'instrumentation automatique (on utilise instrumentation.ts)
  autoInstrumentServerFunctions: false,

  // Telemetry Sentry opt-out
  telemetry: false,
});
