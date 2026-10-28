/**
 * Gmail API calls — header-only by default, body only when explicitly requested.
 * Mirrors the same META_HEADERS list as the extension.
 */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Same list as extension — only headers, never body by default
const META_HEADERS = [
  "From", "To", "Subject", "Date", "Message-ID",
  "Reply-To", "Return-Path", "Authentication-Results",
  "Received", "X-Mailer",
];

async function gmailFetch(token: string, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${GMAIL_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("401: Token expired");
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
  return res.json();
}

/** Returns a list of up to `max` message IDs from the inbox. */
export async function fetchMessageList(token: string, max = 20): Promise<string[]> {
  const data = await gmailFetch(token, "/messages", {
    maxResults: String(max),
    labelIds: "INBOX",
    fields: "messages/id",
  });
  return (data.messages ?? []).map((m: { id: string }) => m.id);
}

/** Fetches metadata headers only for a single message. */
export async function fetchMessageMeta(token: string, id: string) {
  const data = await gmailFetch(token, `/messages/${id}`, {
    format: "metadata",
    metadataHeaders: META_HEADERS.join(","),
    fields: "id,snippet,payload/headers",
  });
  if (!data?.payload?.headers) return null;
  return {
    id: data.id as string,
    headers: data.payload.headers as { name: string; value: string }[],
    snippet: (data.snippet ?? "") as string,
  };
}

/** Fetches and decodes the plain-text / HTML body of one email. Requires gmail.readonly scope. */
export async function fetchMessageBody(token: string, id: string): Promise<{ text: string; html: string }> {
  const data = await gmailFetch(token, `/messages/${id}`, { format: "full" });

  function decodePart(part: any): { text: string; html: string } {
    const mimeType: string = part.mimeType ?? "";
    const body: string = part.body?.data ?? "";
    const decoded = body ? atob(body.replace(/-/g, "+").replace(/_/g, "/")) : "";

    if (mimeType === "text/plain") return { text: decoded, html: "" };
    if (mimeType === "text/html") return { text: "", html: decoded };
    if (part.parts) {
      return part.parts.reduce(
        (acc: { text: string; html: string }, p: any) => {
          const r = decodePart(p);
          return { text: acc.text || r.text, html: acc.html || r.html };
        },
        { text: "", html: "" }
      );
    }
    return { text: "", html: "" };
  }

  return decodePart(data.payload ?? {});
}
