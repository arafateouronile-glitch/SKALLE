import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Désactiver en développement
  enabled: process.env.NODE_ENV === "production",

  // Taux d'échantillonnage des traces de performance (0.0 à 1.0)
  tracesSampleRate: 0.2,

  // Replays : 10% des sessions, 100% des sessions avec erreurs
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,   // Masquer les données sensibles
      blockAllMedia: false,
    }),
  ],

  // Filtrer les erreurs non-actionnables (navigation, réseau...)
  beforeSend(event) {
    if (event.exception?.values?.[0]?.type === "ChunkLoadError") return null;
    return event;
  },
});
