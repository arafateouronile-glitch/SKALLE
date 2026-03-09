import { ImapFlow } from "imapflow";

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface DetectedReply {
  fromEmail: string;
  subject: string;
  snippet: string;
  messageId: string;
  inReplyTo?: string;
  receivedAt: Date;
}

/**
 * Verifie la boite IMAP pour trouver des reponses a nos emails
 */
export async function checkImapForReplies(
  config: ImapConfig,
  since: Date
): Promise<DetectedReply[]> {
  const replies: DetectedReply[] = [];

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
  });

  try {
    await client.connect();

    // Ouvrir INBOX
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Chercher les messages recus depuis `since`
      const messages = client.fetch(
        { since, seen: false },
        {
          envelope: true,
          bodyStructure: true,
          headers: ["in-reply-to", "references", "message-id"],
          source: { start: 0, maxLength: 500 }, // Premier 500 chars pour snippet
        }
      );

      for await (const msg of messages) {
        const envelope = msg.envelope;
        if (!envelope) continue;

        // Parse raw headers buffer into key-value pairs
        const rawHeaders = msg.headers ? msg.headers.toString("utf-8") : "";
        const getHeader = (name: string): string => {
          const regex = new RegExp(`^${name}:\\s*(.+)$`, "im");
          const match = rawHeaders.match(regex);
          return match?.[1]?.trim() || "";
        };

        // Ne garder que les reponses (subject commence par Re: ou a un In-Reply-To)
        const subject = envelope.subject || "";
        const inReplyToHeader = getHeader("in-reply-to");
        const referencesHeader = getHeader("references");
        const isReply =
          subject.toLowerCase().startsWith("re:") ||
          inReplyToHeader.length > 0 ||
          referencesHeader.length > 0;

        if (!isReply) continue;

        const fromEmail =
          envelope.from?.[0]?.address || "";
        const messageId =
          envelope.messageId || getHeader("message-id");

        if (!fromEmail || !messageId) continue;

        // Extraire un snippet du body
        let snippet = "";
        if (msg.source) {
          const text = msg.source.toString("utf-8");
          // Prendre les premiers 200 chars du body text
          const bodyStart = text.indexOf("\r\n\r\n");
          if (bodyStart > -1) {
            snippet = text
              .substring(bodyStart + 4, bodyStart + 204)
              .replace(/\r?\n/g, " ")
              .trim();
          }
        }

        replies.push({
          fromEmail,
          subject,
          snippet,
          messageId,
          inReplyTo: inReplyToHeader || undefined,
          receivedAt: envelope.date || new Date(),
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    console.error("IMAP check error:", error);
    // Ne pas throw pour ne pas bloquer le cron
  }

  return replies;
}

/**
 * Verifier une connexion IMAP
 */
export async function verifyImapConnection(
  config: ImapConfig
): Promise<{ success: boolean; error?: string }> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Presets IMAP par provider
export const IMAP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
  },
  outlook: {
    host: "outlook.office365.com",
    port: 993,
    secure: true,
  },
};
