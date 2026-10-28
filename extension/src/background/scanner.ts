import { evaluate, isWhitelisted, parseHeaders, FREE_MAIL, type Intel } from "@mailtrace/core";
import type { StoredItem } from "../shared/types";
import { CONFIG } from "../shared/config";
import { buildCtx, updateBadge } from "./engine";
import { AuthError, getMetadata, getProfile, getToken, listRecentInbox, newMessagesSince } from "./gmail";
import { lookupDomain, lookupIp } from "./backend";
import { audit, get, putItems, set, sha256 } from "./store";

let running: Promise<void> | null = null;

async function mapLimit<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) { const idx = i++; out[idx] = await fn(xs[idx]); }
  }));
  return out;
}

async function scanIds(ids: string[], backfill: boolean): Promise<void> {
  const known = new Set((await get("items")).map((i) => i.id));
  const todo = ids.filter((id) => !known.has(id));
  if (!todo.length) return;

  const base = await buildCtx();
  const seen = new Set(await get("seen"));
  const results = await mapLimit(todo, 4, async (id): Promise<StoredItem | null> => {
    const m = await getMetadata(id);
    const meta = parseHeaders(m.headers, id);
    if (!meta) return null;

    // Skip network lookups when the answer can't change the outcome (saves free-tier quota).
    const trusted = isWhitelisted(meta.from.domain, base.whitelist);
    const intel: Intel = {};
    const [d, ip] = await Promise.all([
      trusted || FREE_MAIL.has(meta.from.domain) ? null : lookupDomain(meta.from.domain),
      trusted || !meta.originIp ? null : lookupIp(meta.originIp, base.plan),
    ]);
    if (d) intel.domain = d;
    if (ip) intel.ip = ip;

    const hash = await sha256(meta.from.email);
    // On first install we can't know who has emailed the user before, so don't call everyone "new".
    const firstTime = !backfill && !seen.has(hash);
    const verdict = evaluate(meta, intel, { ...base, isFirstTimeSender: firstTime });
    return {
      id, threadId: m.threadId, fromEmail: meta.from.email, fromName: meta.from.name,
      subject: meta.subject, ts: m.internalDate || Date.now(), meta, intel, firstTime, deepRead: false, verdict,
    };
  });

  const items = results.filter((x): x is StoredItem => !!x);
  for (const i of items) seen.add(await sha256(i.fromEmail));
  await putItems(items);
  await set("seen", [...seen].slice(-5000));
  if (items.length) await audit({ action: "metadata_scan", scope: "gmail.metadata", count: items.length, bodyRead: false, result: "ok" });
}

async function resync(): Promise<void> {
  const profile = await getProfile(); // read historyId first so nothing arriving mid-scan is missed
  await scanIds(await listRecentInbox(15), true);
  await set("historyId", profile.historyId);
}

export function runScan(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (!(await getToken(false))) return;
      const hist = await get("historyId");
      if (!hist) await resync();
      else {
        const r = await newMessagesSince(hist);
        if (!r) await resync();
        else { await scanIds(r.ids, false); await set("historyId", r.historyId); }
      }
      await set("lastScan", Date.now());
      await set("error", undefined);
    } catch (e) {
      await set("error", e instanceof AuthError ? "Sign in again to keep scanning." : "Couldn't reach Gmail — will retry.");
    } finally {
      await updateBadge();
      running = null;
    }
  })();
  return running;
}

export { CONFIG };
