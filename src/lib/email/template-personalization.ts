/**
 * 📝 Template Email Personalization
 *
 * Personnalisation par substitution de variables {firstName}, {company}, etc.
 * Fonctionne sans clé API (pas besoin d'OpenAI).
 */

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TemplateVariables {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string;
  industry: string;
  location: string;
  linkedInUrl: string;
  senderName: string;
  senderEmail: string;
  senderCompany: string;
}

export interface TemplateVariableInfo {
  key: string;
  label: string;
  example: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 VARIABLES DISPONIBLES
// ═══════════════════════════════════════════════════════════════════════════

export function getAvailableVariables(): TemplateVariableInfo[] {
  return [
    { key: "firstName", label: "Prénom", example: "Marie" },
    { key: "lastName", label: "Nom", example: "Dupont" },
    { key: "fullName", label: "Nom complet", example: "Marie Dupont" },
    { key: "email", label: "Email", example: "m.dupont@company.fr" },
    { key: "company", label: "Entreprise", example: "Acme Corp" },
    { key: "jobTitle", label: "Poste", example: "Directrice Marketing" },
    { key: "industry", label: "Secteur", example: "Formation" },
    { key: "location", label: "Localisation", example: "Paris" },
    { key: "senderName", label: "Votre nom", example: "Jean Martin" },
    { key: "senderCompany", label: "Votre entreprise", example: "Skalle" },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 APPLICATION DU TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remplace les variables {key} dans un template par les valeurs correspondantes
 */
export function applyTemplate(
  template: string,
  variables: TemplateVariables
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = (variables as unknown as Record<string, string>)[key];
    return value !== undefined && value !== "" ? value : match;
  });
}

/**
 * Extrait les variables utilisées dans un template
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

/**
 * Construit les variables depuis un prospect
 */
export function buildVariablesFromProspect(
  prospect: {
    name: string;
    email?: string | null;
    company: string;
    jobTitle?: string | null;
    industry?: string | null;
    location?: string | null;
    linkedInUrl?: string | null;
  },
  sender: { name: string; email: string; company: string }
): TemplateVariables {
  const nameParts = prospect.name.split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  return {
    firstName,
    lastName,
    fullName: prospect.name,
    email: prospect.email || "",
    company: prospect.company || "",
    jobTitle: prospect.jobTitle || "",
    industry: prospect.industry || "",
    location: prospect.location || "",
    linkedInUrl: prospect.linkedInUrl || "",
    senderName: sender.name,
    senderEmail: sender.email,
    senderCompany: sender.company,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 TEMPLATES PAR DÉFAUT
// ═══════════════════════════════════════════════════════════════════════════

export interface StepTemplate {
  stepNumber: number;
  subject: string;
  content: string;
  delayDays: number;
}

export function getDefaultCampaignTemplates(stepCount: 2 | 3): StepTemplate[] {
  const templates: StepTemplate[] = [
    {
      stepNumber: 1,
      subject: "{firstName}, une question rapide",
      content: `<p>Bonjour {firstName},</p>

<p>Je me permets de vous contacter car, en tant que {jobTitle} chez {company}, vous êtes certainement confronté(e) aux défis de croissance de votre activité.</p>

<p>Chez {senderCompany}, nous aidons des professionnels comme vous à atteindre leurs objectifs plus rapidement.</p>

<p>Seriez-vous disponible pour un échange de 15 minutes cette semaine ?</p>

<p>Bien cordialement,<br/>{senderName}</p>`,
      delayDays: 0,
    },
    {
      stepNumber: 2,
      subject: "Re: {firstName}, une question rapide",
      content: `<p>Bonjour {firstName},</p>

<p>Je reviens vers vous suite à mon précédent message. Je comprends que vous êtes très sollicité(e).</p>

<p>Pour être bref : nous avons récemment aidé des entreprises dans le secteur {industry} à améliorer significativement leurs résultats.</p>

<p>Est-ce que 10 minutes cette semaine vous conviendraient pour en discuter ?</p>

<p>Cordialement,<br/>{senderName}</p>`,
      delayDays: 3,
    },
  ];

  if (stepCount === 3) {
    templates.push({
      stepNumber: 3,
      subject: "Dernier message, {firstName}",
      content: `<p>Bonjour {firstName},</p>

<p>C'est mon dernier message à ce sujet. Je ne veux pas être insistant(e).</p>

<p>Si le timing n'est pas le bon, je comprends tout à fait. N'hésitez pas à me recontacter quand vous le souhaitez.</p>

<p>En attendant, je vous souhaite une excellente continuation chez {company}.</p>

<p>Bien à vous,<br/>{senderName}</p>`,
      delayDays: 5,
    });
  }

  return templates;
}
