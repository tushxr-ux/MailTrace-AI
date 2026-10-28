import { applyDeep, evaluate, type UserContext } from "@mailtrace/core";
import type { StoredItem } from "../shared/types";
import { get, set } from "./store";

export async function buildCtx(): Promise<Omit<UserContext, "isFirstTimeSender">> {
  const [blocked, allowed, wl, settings] = await Promise.all([get("blocked"), get("allowed"), get("whitelist"), get("settings")]);
  return { blocked: Object.keys(blocked), allowed, whitelist: wl.domains, plan: settings.plan, lang: settings.lang };
}

/** Recompute a verdict from stored headers (+ deep findings, if the user already ran a report). */
export function reeval(item: StoredItem, base: Omit<UserContext, "isFirstTimeSender">): StoredItem {
  let verdict = evaluate(item.meta, item.intel, { ...base, isFirstTimeSender: item.firstTime });
  const deep = item.verdict.evidence.deep;
  if (deep) verdict = applyDeep(verdict, deep, base.lang);
  return { ...item, verdict };
}

export async function reevaluateAll(): Promise<void> {
  const [items, base] = await Promise.all([get("items"), buildCtx()]);
  await set("items", items.map((i) => reeval(i, base)));
  await updateBadge();
}

export async function updateBadge(): Promise<void> {
  const [items, blocked] = await Promise.all([get("items"), get("blocked")]);
  const open = items.filter((i) => i.verdict.level !== "green" && !blocked[i.fromEmail]);
  const red = open.some((i) => i.verdict.level === "red");
  await chrome.action.setBadgeText({ text: open.length ? String(Math.min(open.length, 99)) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: red ? "#E5484D" : "#F5A524" });
}
