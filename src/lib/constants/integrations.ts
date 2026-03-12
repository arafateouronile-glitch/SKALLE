/**
 * Constantes pour la page Intégrations (connecteurs externes).
 * Fichier séparé pour pouvoir être importé par les Client Components
 * sans passer par une Server Action.
 */

export type ExternalIntegrationProvider =
  | "WORDPRESS"
  | "STRAPI"
  | "SANITY"
  | "CONTENTFUL"
  | "REST_API"
  | "SENDGRID"
  | "CUSTOM_CRM"
  | "BUFFER"
  | "AYRSHARE"
  | "WEBHOOK"
  | "LINKEDIN_OAUTH";

export const EXTERNAL_INTEGRATION_PROVIDERS: {
  value: ExternalIntegrationProvider;
  label: string;
  description: string;
  category: "cms" | "social" | "email" | "other";
}[] = [
  // CMS / Sites web
  { value: "WORDPRESS", label: "WordPress", description: "Publier des articles sur votre site WordPress", category: "cms" },
  { value: "STRAPI", label: "Strapi", description: "CMS headless open-source (v4/v5)", category: "cms" },
  { value: "SANITY", label: "Sanity", description: "CMS headless avec Sanity Studio", category: "cms" },
  { value: "CONTENTFUL", label: "Contentful", description: "CMS headless enterprise", category: "cms" },
  { value: "REST_API", label: "API REST custom", description: "N'importe quel site avec une API (Next.js, Nuxt, Laravel…)", category: "cms" },
  // Réseaux sociaux
  { value: "BUFFER", label: "Buffer", description: "Planification de posts sociaux", category: "social" },
  { value: "AYRSHARE", label: "Ayrshare", description: "Publication multi-réseaux", category: "social" },
  // Email
  { value: "SENDGRID", label: "SendGrid", description: "Envoi d'emails transactionnels", category: "email" },
  // Autres
  { value: "CUSTOM_CRM", label: "CRM personnalisé", description: "Webhook ou API REST custom", category: "other" },
  { value: "WEBHOOK", label: "Webhook", description: "URL de notification personnalisée", category: "other" },
];
