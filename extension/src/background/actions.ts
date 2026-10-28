import { analyzeBody, applyDeep, evaluate } from "@mailtrace/core";
import type { StoredItem } from "../shared/types";
import { buildCtx, reeval, reevaluateAll, updateBadge } from "./engine";
import { lookupDomains } from "./backend";
import { acquireDeepReadToken, createBlockFilter, deleteFilter, discardToken, ensureBlockedLabel, fetchBodyOnce, getToken } from "./gmail";
import { runScan } from "./scanner";
import { audit, get, putItems, set, sha256 } from "./store";

export async function signIn(): Promise<void> {
  const t = await getToken(true);
  if (!t) throw new Error("Google sign-in was cancelled");
  await audit({ action: "sign_in", scope: "gmail.metadata + gmail.labels + gmail.settings.basic", bodyRead: false, result: "ok" });
  await runScan();
}

export async function block(email: string): Promise<void> {
  email = email.toLowerCase();
  const blocked = await get("blocked");
  if (blocked[email]) return;
  const labelId = await ensureBlockedLabel(await get("blockedLabelId"));
  await set("blockedLabelId", labelId);
  const filterId = await createBlockFilter(email, labelId);
  blocked[email] = { at: Date.now(), filterId };
  await set("blocked", blocked);
  await audit({ action: "block", scope: "gmail.settings.basic", bodyRead: false, result: "ok" });
  await reevaluateAll();
}

export async function unblock(email: string): Promise<void> {
  email = email.toLowerCase();
  const blocked = await get("blocked");
  const entry = blocked[email];
  if (!entry) return;
  if (entry.filterId) { try { await deleteFilter(entry.filterId); } catch { /* already gone */ } }
  delete blocked[email];
  await set("blocked", blocked);
  await audit({ action: "unblock", scope: "gmail.settings.basic", bodyRead: false, result: "ok" });
  await reevaluateAll();
}

export async function markSafe(email: string): Promise<void> {
  email = email.toLowerCase();
  if ((await get("blocked"))[email]) await unblock(email);
  const allowed = new Set(await get("allowed"));
  allowed.add(email);
  await set("allowed", [...allowed]);
  await reevaluateAll();
}

/**
 * Layer 2. Body exists only inside this function: fetched → analysed → dropped.
 * Only DOMAINS extracted from links go to the backend; nothing from the body is stored.
 */
export async function requestReport(id: string): Promise<StoredItem> {
  const items = await get("items");
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error("That email is no longer in the list.");
  const base = await buildCtx();

  const token = await acquireDeepReadToken();
  try {
    const body = await fetchBodyOnce(id, token);
    const deep = analyzeBody({ text: body.text, html: body.html });

    const reps = await lookupDomains(deep.linkDomains);
    for (const r of reps ?? []) {
      if ((r.vtMalicious ?? 0) >= 1) {
        deep.hits.push({ id: "D-linkrep", points: 30, family: "reputation", reasonKey: "reported", note: `Link domain ${r.domain} flagged by ${r.vtMalicious} engine(s)` });
      }
    }
    const pts = deep.hits.reduce((s, h) => s + h.points, 0);
    deep.label = pts >= 50 ? "scam" : pts >= 20 ? "suspicious" : "clean";

    const layer1 = evaluate(item.meta, item.intel, { ...base, isFirstTimeSender: item.firstTime });
    const updated: StoredItem = { ...item, deepRead: true, verdict: applyDeep(layer1, deep, base.lang) };
    await putItems([updated]);
    await updateBadge();
    await audit({ action: "deep_read", scope: "gmail.readonly (one-time)", messageIdHash: (await sha256(id)).slice(0, 12), bodyRead: true, result: updated.verdict.level });
    return updated;
  } catch (e) {
    await audit({ action: "deep_read", scope: "gmail.readonly (one-time)", messageIdHash: (await sha256(id)).slice(0, 12), bodyRead: false, result: "error" });
    throw e;
  } finally {
    await discardToken(token); // no standing access afterwards
  }
}

export async function clearAll(): Promise<void> {
  const t = await getToken(false);
  if (t) await chrome.identity.removeCachedAuthToken({ token: t });
  await chrome.storage.local.clear();
  await chrome.action.setBadgeText({ text: "" });
  await audit({ action: "clear_data", scope: "local", bodyRead: false, result: "ok" });
}

export { reeval };

/**
 * Link-check (user-consented). Runs VirusTotal on link domains found in the stored deep findings
 * (or triggers a limited body read to extract them). No body is stored.
 * This is lighter than a full requestReport — it only looks up domains already extracted.
 */
export async function requestLinkCheck(id: string): Promise<StoredItem> {
  const items = await get("items");
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error("That email is no longer in the list.");

  // If we already have deep findings (from a prior report), just re-run the reputation lookup.
  const existing = item.verdict.evidence.deep;
  const domains = existing?.linkDomains ?? [];

  if (!domains.length) {
    // No link domains yet — surface whatever we already know without a body read.
    await audit({ action: "link_check", scope: "backend.domain_lookup (no links found)", bodyRead: false, result: "ok" });
    return item;
  }

  const reps = await lookupDomains(domains);
  const hits = [...(existing?.hits ?? [])];
  for (const r of reps ?? []) {
    if ((r.vtMalicious ?? 0) >= 1) {
      hits.push({ id: "D-linkrep", points: 30, family: "reputation", reasonKey: "reported", note: `Link domain ${r.domain} flagged by ${r.vtMalicious} engine(s)` });
    }
  }
  // Patch the existing verdict with updated hits — do not re-read the body.
  const updated: StoredItem = {
    ...item,
    verdict: {
      ...item.verdict,
      evidence: {
        ...item.verdict.evidence,
        deep: existing ? { ...existing, hits } : undefined,
      },
    },
  };
  await putItems([updated]);
  await updateBadge();
  await audit({ action: "link_check", scope: "backend.domain_lookup", bodyRead: false, result: updated.verdict.level });
  return updated;
}
