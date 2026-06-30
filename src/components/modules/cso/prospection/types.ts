export interface ProspectMessages {
  message1: string;
  message2: string;
  message3: string;
}

export interface Prospect {
  id: string;
  name: string;
  company: string;
  jobTitle?: string | null;
  linkedInUrl: string;
  email?: string | null;
  emailVerified?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
  location?: string | null;
  industry?: string | null;
  notes?: string | null;
  status: string;
  messages?: ProspectMessages | null;
}

export interface QualifiedLead {
  name: string;
  email?: string;
  emailVerified: boolean;
  emailScore?: number;
  phone?: string;
  phoneVerified: boolean;
  linkedInUrl?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  enrichmentData?: {
    source?: string;
    googleRating?: number;
    googleReviewCount?: number;
    googleCategory?: string;
    websiteUrl?: string;
    googleAddress?: string;
    [key: string]: unknown;
  };
}

export const statusColors: Record<string, string> = {
  NEW: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  CONTACTED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  REPLIED: "bg-green-500/20 text-green-400 border-green-500/30",
  CONVERTED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const statusLabels: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  REPLIED: "Répondu",
  CONVERTED: "Converti",
  REJECTED: "Rejeté",
};
