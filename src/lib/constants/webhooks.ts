/**
 * Constantes pour la page Webhooks (événements disponibles).
 * Fichier séparé pour pouvoir être importé par les Client Components
 * sans passer par une Server Action.
 */

export const WEBHOOK_EVENT_OPTIONS = [
  { value: "seo.article.completed", label: "Article SEO terminé" },
  { value: "webhook.ping", label: "Test (ping)" },
] as const;
