/**
 * HubSpot CRM API v3 client
 * Uses Private App token (Bearer auth). No OAuth needed.
 */

const BASE = "https://api.hubapi.com";

export interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    jobtitle?: string;
    company?: string;
    linkedin_bio?: string;
    hs_lead_status?: string;
    notes_last_contacted?: string;
    hubspot_owner_id?: string;
    createdate?: string;
    lastmodifieddate?: string;
    [key: string]: string | undefined;
  };
}

export interface HubSpotEngagement {
  id: string;
  properties: {
    hs_email_subject?: string;
    hs_email_text?: string;
    hs_email_status?: string;
    hs_timestamp?: string;
    [key: string]: string | undefined;
  };
}

export interface HubSpotSearchResult<T> {
  results: T[];
  total: number;
  paging?: { next?: { after: string } };
}

export class HubSpotClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT" = "GET",
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`HubSpot API ${res.status}: ${err}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // ─── Contacts ────────────────────────────────────────────────────────────────

  async getContact(contactId: string): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone,jobtitle,company,linkedin_bio,hs_lead_status,lastmodifieddate`
    );
  }

  async searchContacts(query: string): Promise<HubSpotSearchResult<HubSpotContact>> {
    return this.request<HubSpotSearchResult<HubSpotContact>>(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        query,
        properties: ["firstname", "lastname", "email", "phone", "jobtitle", "company", "linkedin_bio", "hs_lead_status", "lastmodifieddate"],
        limit: 10,
      }
    );
  }

  async searchContactsByEmail(email: string): Promise<HubSpotContact | null> {
    const res = await this.request<HubSpotSearchResult<HubSpotContact>>(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
        properties: ["firstname", "lastname", "email", "phone", "jobtitle", "company", "linkedin_bio", "hs_lead_status", "lastmodifieddate"],
        limit: 1,
      }
    );
    return res.results[0] ?? null;
  }

  async createContact(props: Record<string, string>): Promise<HubSpotContact> {
    return this.request<HubSpotContact>("/crm/v3/objects/contacts", "POST", {
      properties: props,
    });
  }

  async updateContact(contactId: string, props: Record<string, string>): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      `/crm/v3/objects/contacts/${contactId}`,
      "PATCH",
      { properties: props }
    );
  }

  async upsertContact(props: Record<string, string>): Promise<{ contact: HubSpotContact; created: boolean }> {
    if (props.email) {
      const existing = await this.searchContactsByEmail(props.email);
      if (existing) {
        const updated = await this.updateContact(existing.id, props);
        return { contact: updated, created: false };
      }
    }
    const created = await this.createContact(props);
    return { contact: created, created: true };
  }

  async listRecentlyModifiedContacts(since: Date, after?: string): Promise<HubSpotSearchResult<HubSpotContact>> {
    return this.request<HubSpotSearchResult<HubSpotContact>>(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "lastmodifieddate",
                operator: "GTE",
                value: since.getTime().toString(),
              },
            ],
          },
        ],
        properties: ["firstname", "lastname", "email", "phone", "jobtitle", "company", "linkedin_bio", "hs_lead_status", "lastmodifieddate"],
        limit: 100,
        ...(after ? { after } : {}),
      }
    );
  }

  // ─── Email Engagements ───────────────────────────────────────────────────────

  async logEmailActivity(params: {
    contactId: string;
    subject: string;
    body: string;
    status: "SENT" | "OPENED" | "REPLIED";
    timestamp: Date;
  }): Promise<HubSpotEngagement> {
    const engagement = await this.request<HubSpotEngagement>(
      "/crm/v3/objects/emails",
      "POST",
      {
        properties: {
          hs_email_direction: "EMAIL",
          hs_email_status: params.status,
          hs_email_subject: params.subject,
          hs_email_text: params.body,
          hs_timestamp: params.timestamp.toISOString(),
        },
      }
    );

    // Associate to contact
    await this.request(
      `/crm/v3/objects/emails/${engagement.id}/associations/contacts/${params.contactId}/email_to_contact`,
      "PUT"
    );

    return engagement;
  }

  // ─── Validate token ──────────────────────────────────────────────────────────

  async validateToken(): Promise<{ valid: boolean; portalId?: number; appName?: string }> {
    try {
      const res = await fetch(`${BASE}/oauth/v1/access-tokens/${this.token}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) {
        // Try private app endpoint
        const check = await fetch(`${BASE}/crm/v3/objects/contacts?limit=1`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        return { valid: check.ok };
      }
      const data = await res.json();
      return { valid: true, portalId: data.hub_id, appName: data.app_id };
    } catch {
      return { valid: false };
    }
  }
}
