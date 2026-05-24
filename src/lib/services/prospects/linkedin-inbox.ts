/**
 * LinkedIn Inbox — lit la boîte de réception via l'API Voyager LinkedIn.
 *
 * Pas d'API officielle : on utilise le cookie li_at pour accéder aux
 * endpoints non-documentés de LinkedIn (voyager).
 * Fail-gracefully : toutes les erreurs sont catchées, on retourne [] si KO.
 */

const VOYAGER = "https://www.linkedin.com/voyager/api";

function liHeaders(liAt: string): HeadersInit {
  return {
    Cookie: `li_at=${liAt}`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/vnd.linkedin.normalized+json+2.1",
    "X-Li-Lang": "fr_FR",
    "X-Restli-Protocol-Version": "2.0.0",
    "X-Li-Track": JSON.stringify({ clientVersion: "1.13.1987", clientId: "voyager-web" }),
  };
}

/** Retourne le publicIdentifier (slug LinkedIn) du compte propriétaire du cookie. */
export async function fetchMyPublicId(liAt: string): Promise<string | null> {
  try {
    const res = await fetch(`${VOYAGER}/me`, {
      headers: liHeaders(liAt),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { miniProfile?: { publicIdentifier?: string } };
    return data.miniProfile?.publicIdentifier ?? null;
  } catch {
    return null;
  }
}

// ─── Types internes Voyager ────────────────────────────────────────────────────

interface VoyagerMember {
  miniProfile?: {
    publicIdentifier?: string;
    firstName?: string;
    lastName?: string;
  };
}

interface VoyagerEvent {
  createdAt?: number;
  from?: { "com.linkedin.voyager.messaging.MessagingMember"?: VoyagerMember };
  eventContent?: {
    "com.linkedin.voyager.messaging.event.MessageEvent"?: {
      body?: string;
      attributedBody?: { text?: string };
    };
  };
}

interface VoyagerConversation {
  entityUrn?: string;
  lastActivityAt?: number;
  read?: boolean;
  participants?: Array<{
    "com.linkedin.voyager.messaging.MessagingMember"?: VoyagerMember;
  }>;
  events?: VoyagerEvent[];
}

// ─── Parsed reply ─────────────────────────────────────────────────────────────

export interface ParsedLinkedInReply {
  conversationUrn: string;
  participantPublicIdentifier: string;
  participantName: string;
  linkedInUrl: string;
  messageText: string;
  receivedAt: Date;
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

/**
 * Récupère les conversations LinkedIn avec des messages reçus depuis `sinceMs`.
 * Ne retourne que les messages ENTRANTS (de l'autre personne, pas de moi).
 */
export async function fetchLinkedInReplies(
  liAt: string,
  sinceMs: number
): Promise<ParsedLinkedInReply[]> {
  const myId = await fetchMyPublicId(liAt);
  const replies: ParsedLinkedInReply[] = [];

  try {
    const res = await fetch(
      `${VOYAGER}/messaging/conversations?keyVersion=LEGACY_INBOX&q=participants&count=40`,
      {
        headers: liHeaders(liAt),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) return [];

    const data = (await res.json()) as { elements?: VoyagerConversation[] };
    const conversations = data.elements ?? [];

    for (const conv of conversations) {
      if (!conv.entityUrn) continue;

      // Filtre : activité après sinceMs
      const lastActivity = conv.lastActivityAt ?? 0;
      if (lastActivity < sinceMs) continue;

      // Participant (l'autre personne, pas moi)
      const otherParticipant = (conv.participants ?? [])
        .map((p) => p["com.linkedin.voyager.messaging.MessagingMember"])
        .find((m) => m?.miniProfile?.publicIdentifier !== myId);

      if (!otherParticipant?.miniProfile?.publicIdentifier) continue;

      const { publicIdentifier, firstName = "", lastName = "" } = otherParticipant.miniProfile;
      const participantName = `${firstName} ${lastName}`.trim() || publicIdentifier;
      const linkedInUrl = `https://www.linkedin.com/in/${publicIdentifier}/`;

      // Cherche le dernier message entrant (from: l'autre personne)
      const events = conv.events ?? [];
      const incomingEvent = events
        .filter((e) => {
          const sender =
            e.from?.["com.linkedin.voyager.messaging.MessagingMember"]?.miniProfile
              ?.publicIdentifier;
          // entrant = sender est l'autre personne (pas moi)
          return sender && sender !== myId && sender === publicIdentifier;
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];

      if (!incomingEvent) continue;
      if ((incomingEvent.createdAt ?? 0) < sinceMs) continue;

      const msgEvent =
        incomingEvent.eventContent?.[
          "com.linkedin.voyager.messaging.event.MessageEvent"
        ];
      const messageText =
        msgEvent?.attributedBody?.text ?? msgEvent?.body ?? "(message sans texte)";

      replies.push({
        conversationUrn: conv.entityUrn,
        participantPublicIdentifier: publicIdentifier,
        participantName,
        linkedInUrl,
        messageText,
        receivedAt: new Date(incomingEvent.createdAt ?? lastActivity),
      });
    }
  } catch {
    // Fail-open : on retourne ce qu'on a
  }

  return replies;
}
