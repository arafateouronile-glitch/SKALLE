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
      // ─── Redirections CMO → CSO : outils Sales migrés vers Sales OS ──────────
      {
        source: "/marketing-os/prospection",
        destination: "/sales-os/prospection",
        permanent: true,
      },
      {
        source: "/marketing-os/prospection/:path*",
        destination: "/sales-os/prospection/:path*",
        permanent: true,
      },
      {
        source: "/marketing-os/social-prospector",
        destination: "/sales-os/social-prospector",
        permanent: true,
      },
      {
        source: "/marketing-os/social-prospector/:path*",
        destination: "/sales-os/social-prospector/:path*",
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
