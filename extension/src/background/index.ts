import type { Settings } from "../shared/types";
import { CONFIG } from "../shared/config";
import { block, clearAll, markSafe, requestReport, signIn, unblock } from "./actions";
import { reevaluateAll, updateBadge } from "./engine";
import { getToken } from "./gmail";
import { runScan } from "./scanner";
import { syncWhitelist } from "./backend";
import { get, set, snapshot } from "./store";

async function ensureAlarms() {
  if (!(await chrome.alarms.get("poll"))) chrome.alarms.create("poll", { periodInMinutes: CONFIG.pollMinutes });
  if (!(await chrome.alarms.get("whitelist"))) chrome.alarms.create("whitelist", { periodInMinutes: 60 * 24 });
}

chrome.runtime.onInstalled.addListener(async (d) => {
  await ensureAlarms();
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
  await syncWhitelist();
  if (d.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});
chrome.runtime.onStartup.addListener(() => { void ensureAlarms(); void updateBadge(); });
void ensureAlarms();

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "poll") void runScan();
  if (a.name === "whitelist") void syncWhitelist();
});

type Msg =
  | { type: "getState" } | { type: "scanNow" } | { type: "signIn" }
  | { type: "requestReport"; id: string }
  | { type: "block" | "unblock" | "markSafe"; email: string }
  | { type: "setSettings"; patch: Partial<Settings> } | { type: "clearData" };

async function handle(m: Msg): Promise<unknown> {
  switch (m.type) {
    case "getState": return snapshot(!!(await getToken(false)));
    case "scanNow": await runScan(); return;
    case "signIn": await signIn(); return;
    case "requestReport": return requestReport(m.id);
    case "block": await block(m.email); return;
    case "unblock": await unblock(m.email); return;
    case "markSafe": await markSafe(m.email); return;
    case "setSettings": {
      const cur = await get("settings");
      await set("settings", { ...cur, ...m.patch });
      if (m.patch.lang || m.patch.plan) await reevaluateAll();
      return;
    }
    case "clearData": await clearAll(); return;
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg).then((r) => sendResponse(r ?? null)).catch((e: unknown) => sendResponse({ __error: e instanceof Error ? e.message : String(e) }));
  return true; // async response
});
