import { CONFIG } from "../shared/config";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const META_HEADERS = ["From", "Reply-To", "Return-Path", "Received", "Authentication-Results", "Subject", "Message-ID"];

export interface GmailMeta {
  id: string;
  threadId: string;
  internalDate: number;
  labelIds: string[];
  headers: { name: string; value: string }[];
}

export async function getToken(interactive: boolean): Promise<string | null> {
  try {
    const r = (await chrome.identity.getAuthToken({ interactive })) as unknown;
    if (typeof r === "string") return r;
    return (r as { token?: string } | undefined)?.token ?? null;
  } catch {
    return null;
  }
}

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getToken(false);
  if (!token) throw new AuthError("Not signed in");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401 && !retried) {
    await chrome.identity.removeCachedAuthToken({ token });
    return call<T>(path, init, true);
  }
  if (res.status === 401 || res.status === 403) throw new AuthError(`Gmail refused access (${res.status})`);
  if (!res.ok) throw Object.assign(new Error(`Gmail ${res.status}`), { status: res.status });
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** METADATA ONLY: format=metadata with an explicit header allow-list. Never `full`, never `raw`. */
export async function getMetadata(id: string): Promise<GmailMeta> {
  const qs = ["format=metadata", ...META_HEADERS.map((h) => `metadataHeaders=${encodeURIComponent(h)}`)].join("&");
  const m = await call<{ id: string; threadId: string; internalDate: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }>(
    `/messages/${id}?${qs}`,
  );
  return { id: m.id, threadId: m.threadId, internalDate: Number(m.internalDate), labelIds: m.labelIds ?? [], headers: m.payload?.headers ?? [] };
}

export const getProfile = () => call<{ emailAddress: string; historyId: string }>("/profile");

export async function listRecentInbox(max = 15): Promise<string[]> {
  const r = await call<{ messages?: { id: string }[] }>(`/messages?labelIds=INBOX&maxResults=${max}`);
  return (r.messages ?? []).map((m) => m.id);
}

/** New inbox message ids since `startHistoryId`. Returns null when history expired (caller should resync). */
export async function newMessagesSince(startHistoryId: string): Promise<{ ids: string[]; historyId: string } | null> {
  const ids = new Set<string>();
  let pageToken = "";
  let historyId = startHistoryId;
  try {
    do {
      const r = await call<{ history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[]; historyId?: string; nextPageToken?: string }>(
        `/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&labelId=INBOX${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      for (const h of r.history ?? []) for (const a of h.messagesAdded ?? []) if (a.message.labelIds?.includes("INBOX")) ids.add(a.message.id);
      historyId = r.historyId ?? historyId;
      pageToken = r.nextPageToken ?? "";
    } while (pageToken);
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
  return { ids: [...ids], historyId };
}

// ---- blocking: labels + filters only (gmail.labels, gmail.settings.basic). NOT gmail.modify. -------
export async function ensureBlockedLabel(cached?: string): Promise<string> {
  if (cached) return cached;
  const list = await call<{ labels?: { id: string; name: string }[] }>("/labels");
  const hit = list.labels?.find((l) => l.name === CONFIG.blockedLabel);
  if (hit) return hit.id;
  const made = await call<{ id: string }>("/labels", {
    method: "POST",
    body: JSON.stringify({ name: CONFIG.blockedLabel, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return made.id;
}

export async function createBlockFilter(email: string, labelId: string): Promise<string> {
  const f = await call<{ id: string }>("/settings/filters", {
    method: "POST",
    body: JSON.stringify({ criteria: { from: email }, action: { addLabelIds: [labelId], removeLabelIds: ["INBOX"] } }),
  });
  return f.id;
}

export async function deleteFilter(id: string): Promise<void> {
  await call<void>(`/settings/filters/${id}`, { method: "DELETE" });
}

// ---- deep read (Layer 2): one message, one-time token ---------------------------------------------
export interface FullBody { text: string; html: string }

function b64url(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8").decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
function collect(p: Part, out: FullBody) {
  if (p.body?.data) {
    if (p.mimeType === "text/plain") out.text += b64url(p.body.data) + "\n";
    else if (p.mimeType === "text/html") out.html += b64url(p.body.data) + "\n";
  }
  p.parts?.forEach((c) => collect(c, out));
}

export async function fetchBodyOnce(id: string, token: string): Promise<FullBody> {
  const res = await fetch(`${API}/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail ${res.status} while reading the message`);
  const m = (await res.json()) as { payload?: Part };
  const out: FullBody = { text: "", html: "" };
  if (m.payload) collect(m.payload, out);
  return out;
}

const REDIRECT = () => chrome.identity.getRedirectURL();

/**
 * Incremental authorization (spec P3): ask for gmail.readonly ONLY now, for ONE message.
 * Preferred path = web-auth flow with the implicit grant → short-lived access token, no refresh token.
 */
export async function acquireDeepReadToken(): Promise<string> {
  if (CONFIG.webClientId) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: CONFIG.webClientId, response_type: "token", redirect_uri: REDIRECT(),
      scope: CONFIG.scopes.deepRead, include_granted_scopes: "false", prompt: "consent",
    }).toString();
    const redirected = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
    const token = redirected && new URLSearchParams(new URL(redirected).hash.slice(1)).get("access_token");
    if (!token) throw new Error("Permission was not granted");
    return token;
  }
  // dev fallback (no web client id configured): scoped getAuthToken
  const r = (await chrome.identity.getAuthToken({ interactive: true, scopes: [CONFIG.scopes.deepRead] })) as unknown;
  const token = typeof r === "string" ? r : (r as { token?: string })?.token;
  if (!token) throw new Error("Permission was not granted");
  return token;
}

export async function discardToken(token: string): Promise<void> {
  try { await chrome.identity.removeCachedAuthToken({ token }); } catch { /* not a cached token */ }
  try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }); } catch { /* best effort */ }
}
