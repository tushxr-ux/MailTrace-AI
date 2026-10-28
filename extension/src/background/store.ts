import { DEFAULT_SETTINGS, type AuditEntry, type BlockedEntry, type PanelState, type Settings, type StoredItem } from "../shared/types";
import { CONFIG } from "../shared/config";

interface Schema {
  items: StoredItem[];
  blocked: Record<string, BlockedEntry>;
  allowed: string[];
  seen: string[];
  whitelist: { etag?: string; domains: string[] };
  settings: Settings;
  audit: AuditEntry[];
  historyId?: string;
  blockedLabelId?: string;
  lastScan?: number;
  error?: string;
}
const DEFAULTS: Schema = {
  items: [], blocked: {}, allowed: [], seen: [], whitelist: { domains: [] },
  settings: DEFAULT_SETTINGS, audit: [],
};

export async function get<K extends keyof Schema>(key: K): Promise<Schema[K]> {
  const r = await chrome.storage.local.get(key);
  return (r[key] ?? DEFAULTS[key]) as Schema[K];
}
export async function set<K extends keyof Schema>(key: K, value: Schema[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Local, user-visible permission log — makes the privacy claim verifiable (spec §10.3). */
export async function audit(e: Omit<AuditEntry, "ts">): Promise<void> {
  const log = await get("audit");
  log.unshift({ ts: Date.now(), ...e });
  await set("audit", log.slice(0, 300));
}

export async function putItems(updated: StoredItem[]): Promise<void> {
  const items = await get("items");
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const u of updated) byId.set(u.id, u);
  const merged = [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, CONFIG.maxItems);
  await set("items", merged);
}

export async function snapshot(signedIn: boolean): Promise<PanelState> {
  const [items, blocked, allowed, settings, auditLog, lastScan, error] = await Promise.all([
    get("items"), get("blocked"), get("allowed"), get("settings"), get("audit"), get("lastScan"), get("error"),
  ]);
  return { items, blocked, allowed, settings, audit: auditLog, signedIn, lastScan, error };
}
