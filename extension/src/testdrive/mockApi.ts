import { analyzeBody, applyDeep, evaluate, parseHeaders, type Intel, type UserContext } from "@mailtrace/core";
import type { Api, AuditEntry, PanelState, Settings, StoredItem } from "../shared/types";
import { headersFor, SAMPLES, type Sample } from "./samples";

/** In-memory Api backed by the REAL core engine — what the test-drive page and screenshots run on. */
export function createMockApi(askPermission: (item: StoredItem) => Promise<boolean>): Api {
  let settings: Settings = { plan: "free", lang: "en", onboarded: true };
  const blocked: PanelState["blocked"] = {};
  let allowed: string[] = [];
  const audit: AuditEntry[] = [];
  const listeners = new Set<() => void>();
  const bySample = new Map<string, Sample>(SAMPLES.map((s) => [s.id, s]));
  const deepCache = new Map<string, ReturnType<typeof analyzeBody>>();
  const notify = () => listeners.forEach((l) => l());

  const ctx = (firstTime: boolean): UserContext => ({
    blocked: Object.keys(blocked), allowed, whitelist: [], isFirstTimeSender: firstTime, plan: settings.plan, lang: settings.lang,
  });

  const build = (s: Sample): StoredItem => {
    const meta = parseHeaders(headersFor(s), s.id)!;
    const intel: Intel = s.intel;
    let verdict = evaluate(meta, intel, ctx(s.firstTime));
    const deep = deepCache.get(s.id);
    if (deep) verdict = applyDeep(verdict, deep, settings.lang);
    return { id: s.id, threadId: s.threadId, fromEmail: meta.from.email, fromName: meta.from.name, subject: s.subject, ts: Date.now() - SAMPLES.indexOf(s) * 3_600_000, meta, intel, firstTime: s.firstTime, deepRead: !!deep, verdict };
  };

  audit.unshift({ ts: Date.now(), action: "metadata_scan", scope: "gmail.metadata", count: SAMPLES.length, bodyRead: false, result: "ok" });

  return {
    async getState() {
      return { items: SAMPLES.map(build), blocked: { ...blocked }, allowed, settings, audit: [...audit], signedIn: true, lastScan: Date.now(), demo: true };
    },
    async scanNow() { notify(); },
    async signIn() {},
    async requestReport(id) {
      const s = bySample.get(id)!;
      const ok = await askPermission(build(s));
      if (!ok) { audit.unshift({ ts: Date.now(), action: "deep_read", scope: "gmail.readonly (one-time)", messageIdHash: id.padEnd(12, "0"), bodyRead: false, result: "error" }); notify(); throw new Error("Permission was not granted"); }
      await new Promise((r) => setTimeout(r, 700));
      deepCache.set(id, analyzeBody(s.body ?? { text: "" }));
      const item = build(s);
      audit.unshift({ ts: Date.now(), action: "deep_read", scope: "gmail.readonly (one-time)", messageIdHash: id.padEnd(12, "0"), bodyRead: true, result: item.verdict.level });
      notify();
      return item;
    },
    async block(email) { blocked[email] = { at: Date.now(), filterId: "demo-filter" }; audit.unshift({ ts: Date.now(), action: "block", scope: "gmail.settings.basic", bodyRead: false, result: "ok" }); notify(); },
    async unblock(email) { delete blocked[email]; audit.unshift({ ts: Date.now(), action: "unblock", scope: "gmail.settings.basic", bodyRead: false, result: "ok" }); notify(); },
    async markSafe(email) { delete blocked[email]; allowed = [...new Set([...allowed, email])]; notify(); },
    async setSettings(p) { settings = { ...settings, ...p }; notify(); },
    async clearData() { Object.keys(blocked).forEach((k) => delete blocked[k]); allowed = []; deepCache.clear(); audit.length = 0; notify(); },
    subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
}
