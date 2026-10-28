import type { Api, PanelState, Settings, StoredItem } from "./types";

type Msg =
  | { type: "getState" } | { type: "scanNow" } | { type: "signIn" }
  | { type: "requestReport"; id: string }
  | { type: "requestLinkCheck"; id: string }
  | { type: "block" | "unblock" | "markSafe"; email: string }
  | { type: "setSettings"; patch: Partial<Settings> } | { type: "clearData" };

async function send<T>(m: Msg): Promise<T> {
  const res = await chrome.runtime.sendMessage(m);
  if (res && typeof res === "object" && "__error" in res) throw new Error(String((res as { __error: string }).__error));
  return res as T;
}

/** Runs in side panel + content script: every call is a message to the service worker. */
export const chromeApi: Api = {
  getState: () => send<PanelState>({ type: "getState" }),
  scanNow: () => send({ type: "scanNow" }),
  signIn: () => send({ type: "signIn" }),
  requestReport: (id) => send<StoredItem>({ type: "requestReport", id }),
  requestLinkCheck: (id) => send<StoredItem>({ type: "requestLinkCheck", id }),
  block: (email) => send({ type: "block", email }),
  unblock: (email) => send({ type: "unblock", email }),
  markSafe: (email) => send({ type: "markSafe", email }),
  setSettings: (patch) => send({ type: "setSettings", patch }),
  clearData: () => send({ type: "clearData" }),
  subscribe(cb) {
    const fn = (_c: unknown, area: string) => { if (area === "local") cb(); };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  },
};
