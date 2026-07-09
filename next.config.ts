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

  images: {
    remotePatterns: [
      // Supabase Storage — avatars, persons, video-ads assets
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      // Supabase signed URLs
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/sign/**",
      },
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
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
      { source: "/marketing-os/discovery", destination: "/marketing-os/spy", permanent: true },
      { source: "/marketing-os/discovery/:path*", destination: "/marketing-os/spy", permanent: true },
      { source: "/marketing-os/analytics", destination: "/marketing-os/insights", permanent: true },
      { source: "/marketing-os/analytics/:path*", destination: "/marketing-os/insights", permanent: true },
      // ─── Sprint 4 : ancien CSO tools → nouvelles pages unifiées ────────────
      { source: "/sales-os/crm", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/crm/:path*", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/pipeline", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/pipeline/:path*", destination: "/sales-os/leads", permanent: true },
      { source: "/sales-os/reply-assistant", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/reply-assistant/:path*", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/sequences", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/sequences/:path*", destination: "/sales-os/outreach", permanent: true },
      { source: "/sales-os/hunt", destination: "/sales-os/discovery", permanent: true },
      { source: "/sales-os/signals-radar", destination: "/sales-os/discovery?tab=signals", permanent: false },
      { source: "/sales-os/local-radar", destination: "/sales-os/discovery?tab=local", permanent: false },
      { source: "/sales-os/newborn-radar", destination: "/sales-os/discovery?tab=newborn", permanent: false },
      { source: "/sales-os/partnerships", destination: "/sales-os/partnerships", permanent: false },
      // /sales-os/agent is now a real page — redirect removed
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
        destination: "/sales-os/discovery",
        permanent: true,
      },
      {
        source: "/marketing-os/social-prospector/:path*",
        destination: "/sales-os/discovery",
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
