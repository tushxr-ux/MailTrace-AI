import type { Intel, Lang, Level, ParsedMetadata, Plan, Verdict } from "@mailtrace/core";

export interface Settings { plan: Plan; lang: Lang; onboarded: boolean }

export interface StoredItem {
  id: string;
  threadId?: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  ts: number;
  /** headers only — kept so verdicts can be re-evaluated offline (block, language, plan) */
  meta: ParsedMetadata;
  intel: Intel;
  firstTime: boolean;
  deepRead: boolean;
  verdict: Verdict;
}

export interface BlockedEntry { at: number; filterId?: string }

export interface AuditEntry {
  ts: number;
  action: "metadata_scan" | "deep_read" | "block" | "unblock" | "sign_in" | "clear_data";
  scope: string;
  messageIdHash?: string;
  count?: number;
  bodyRead: boolean;
  result?: Level | "ok" | "error";
}

export interface PanelState {
  items: StoredItem[];
  blocked: Record<string, BlockedEntry>;
  allowed: string[];
  settings: Settings;
  audit: AuditEntry[];
  signedIn: boolean;
  lastScan?: number;
  error?: string;
  /** true on the standalone test-drive page */
  demo?: boolean;
}

export const DEFAULT_SETTINGS: Settings = { plan: "free", lang: "en", onboarded: false };

/** The single seam between UI and engine. chromeApi (real) and mockApi (test-drive) both implement it. */
export interface Api {
  getState(): Promise<PanelState>;
  scanNow(): Promise<void>;
  signIn(): Promise<void>;
  requestReport(id: string): Promise<StoredItem>;
  block(email: string): Promise<void>;
  unblock(email: string): Promise<void>;
  markSafe(email: string): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<void>;
  clearData(): Promise<void>;
  subscribe(cb: () => void): () => void;
}
