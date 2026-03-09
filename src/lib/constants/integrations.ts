/**
 * Constantes pour la page Intégrations (connecteurs externes).
 * Fichier séparé pour pouvoir être importé par les Client Components
 * sans passer par une Server Action.
 */

export type ExternalIntegrationProvider =
  | "WORDPRESS"
  | "SENDGRID"
  | "CUSTOM_CRM"
  | "BUFFER"
  | "AYRSHARE"
  | "WEBHOOK";

export const EXTERNAL_INTEGRATION_PROVIDERS: {
  value: ExternalIntegrationProvider;
  label: string;
  description: string;
}[] = [
  { value: "WORDPRESS", label: "WordPress", description: "Publier des articles sur votre site WordPress" },
  { value: "SENDGRID", label: "SendGrid", description: "Envoi d'emails transactionnels" },
  { value: "CUSTOM_CRM", label: "CRM personnalisé", description: "Webhook ou API REST custom" },
  { value: "BUFFER", label: "Buffer", description: "Planification de posts sociaux" },
  { value: "AYRSHARE", label: "Ayrshare", description: "Publication multi-réseaux" },
  { value: "WEBHOOK", label: "Webhook", description: "URL de notification personnalisée" },
];
