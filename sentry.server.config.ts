import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  tracesSampleRate: 0.2,

  beforeSend(event) {
    // Retirer les données d'authentification des breadcrumbs
    if (event.request?.cookies && typeof event.request.cookies === "object") {
      event.request.cookies = { "[Filtered]": "" };
    }
    return event;
  },
});
