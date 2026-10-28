import type { Api, PanelState, StoredItem } from "../shared/types";
import { advancedRows, LEVEL_LABEL, pillText, reasonOf } from "../shared/format";
import { BADGE_CSS, BANNER_CSS } from "./theme";
import { el, shadowHost } from "./dom";

const iconUrl = (): string => {
  try { return chrome.runtime.getURL("assets/icons/icon-32.png"); } catch { return "assets/icons/icon-32.png"; }
};

export function renderBadge(item: StoredItem, state: PanelState): HTMLElement {
  const { host, root } = shadowHost(BADGE_CSS, "mt-badge");
  const lvl = item.verdict.level;
  const quiet = lvl === "green" && pillText(item, state.settings.lang) === "Safe"; // only unverified-but-fine mail stays silent
  const pill = el("span", { class: `pill ${lvl}${quiet ? " quiet" : ""}`, attrs: { title: reasonOf(item, state.settings.lang) } },
    el("span", { class: "dot" }), el("span", { class: "label", text: pillText(item, state.settings.lang) }));
  // Attachment hint — shown as a small paperclip tag next to the pill
  if (item.hasAttachment && lvl !== "green") {
    const clip = el("span", { class: "attach-hint", attrs: { title: "Contains attachment — check before opening" }, text: "📎 Attachment" });
    root.append(pill, clip);
  } else {
    root.append(pill);
  }
  return host;
}

type View = "idle" | "loading" | "report" | "blocked" | "safe" | "link-prompt";

export interface Banner { host: HTMLElement; update(item: StoredItem, state: PanelState): void }

/** In-inbox warning banner — only ever created for 🟡 / 🔴 (🟢 stays silent). */
export function createBanner(initial: StoredItem, initialState: PanelState, api: Api): Banner {
  const { host, root } = shadowHost(BANNER_CSS, "mt-banner");
  const mount = el("div");
  root.append(mount);
  let item = initial;
  let state = initialState;
  let view: View = state.blocked[item.fromEmail] ? "blocked" : "idle";
  let error = "";

  const run = async (next: View, fn: () => Promise<void>) => {
    error = ""; const prev = view; view = next; render();
    try { await fn(); } catch (e) { error = e instanceof Error ? e.message : "Something went wrong."; view = prev; }
    render();
  };

  const onReport = () => run("loading", async () => { item = await api.requestReport(item.id); view = "report"; });
  const onBlock = () => run("loading", async () => { await api.block(item.fromEmail); view = "blocked"; });
  const onUnblock = () => run("loading", async () => { await api.unblock(item.fromEmail); view = "idle"; });
  const onSafe = () => run("loading", async () => { await api.markSafe(item.fromEmail); view = "safe"; });
  const onLinkCheck = () => run("loading", async () => { item = await api.requestLinkCheck(item.id); view = "report"; });
  const onLinkPromptShow = () => { view = "link-prompt"; render(); };

  function render() {
    const lang = state.settings.lang;
    const lvl = item.verdict.level === "green" && view !== "safe" ? "green" : item.verdict.level;
    mount.replaceChildren();

    if (view === "safe") {
      mount.append(el("div", { class: "card green" },
        el("div", { class: "top" }, el("div", { class: "light", text: "✓" }),
          el("div", {}, el("div", { class: "head", text: "MailTrace AI" }),
            el("p", { class: "reason", text: `Okay — ${item.fromEmail} is marked as safe.` })))));
      return;
    }
    if (view === "blocked") {
      mount.append(el("div", { class: "card red" },
        el("div", { class: "top" }, el("div", { class: "light", text: "✕" }),
          el("div", {}, el("div", { class: "head", text: "Sender blocked" }),
            el("p", { class: "reason", text: `Future emails from ${item.fromEmail} will skip your inbox.` }),
            el("div", { class: "actions" }, el("button", { text: "Unblock sender", on: { click: () => void onUnblock() } })),
            error ? el("div", { class: "err", text: error }) : null))));
      return;
    }

    if (view === "link-prompt") {
      mount.append(el("div", { class: `card ${lvl}` },
        el("div", { class: "top" }, el("div", { class: "light", text: "🔗" }),
          el("div", { class: "grow" },
            el("div", { class: "head" }, el("img", { attrs: { src: iconUrl(), alt: "" } }), "MailTrace AI · Link Check"),
            el("p", { class: "reason", text: "This email contains links or attachments. Allow MailTrace AI to check them against threat databases? Only domain names are sent — never the full email." }),
            el("div", { class: "actions" },
              el("button", { class: "primary", text: "Allow — Check links", on: { click: () => void onLinkCheck() } }),
              el("button", { text: "No thanks", on: { click: () => { view = "idle"; render(); } } }),
            ),
            error ? el("div", { class: "err", text: error }) : null))));
      return;
    }

    const loading = view === "loading";
    // Show "Check links" button for suspicious/danger emails that have attachment hint or link domains
    const hasLinks = (item.verdict.evidence.deep?.linkDomains?.length ?? 0) > 0 || item.hasAttachment;
    const buttons = [
      el("button", { class: "danger", text: "Block sender", attrs: loading ? { disabled: "" } : {}, on: { click: () => void onBlock() } }),
      ...(hasLinks && !item.deepRead && !loading ? [el("button", { class: "warn", text: "🔗 Check links", attrs: {}, on: { click: () => onLinkPromptShow() } })] : []),
      el("button", { class: "primary", text: loading ? "Reading this email once…" : item.deepRead ? "Refresh report" : "Deep analysis", attrs: loading ? { disabled: "" } : {}, on: { click: () => void onReport() } }),
      el("button", { text: "Mark as safe", attrs: loading ? { disabled: "" } : {}, on: { click: () => void onSafe() } }),
    ];
    const card = el("div", { class: `card ${lvl}` },
      el("div", { class: "top" },
        el("div", { class: "light", text: lvl === "red" ? "!" : lvl === "yellow" ? "?" : "✓" }),
        el("div", { class: "grow" },
          el("div", { class: "head" }, el("img", { attrs: { src: iconUrl(), alt: "" } }), `MailTrace AI · ${LEVEL_LABEL[lang][lvl]}`),
          el("p", { class: "reason", text: reasonOf(item, lang) }),
          el("div", { class: "actions" }, ...buttons),
          error ? el("div", { class: "err", text: error }) : null)));

    if (view === "report" || item.deepRead) {
      card.append(el("div", { class: "note", text: "Read once for this report. The email body was not stored." }));
      if (lvl === "red") {
        card.append(el("div", { class: "report1930" }, "Lost money or shared details? Report at ",
          el("a", { text: "cybercrime.gov.in", attrs: { href: "https://cybercrime.gov.in", target: "_blank", rel: "noopener noreferrer" } }), " or call 1930."));
      }
      const dl = el("dl");
      for (const r of advancedRows(item, state.settings.plan)) dl.append(el("dt", { text: r.label }), el("dd", { text: r.value }));
      card.append(el("details", {}, el("summary", { text: "Advanced details" }), dl));
    }
    mount.append(card);
  }

  render();
  return { host, update(i, s) { item = i; state = s; if (view !== "loading") { if (s.blocked[i.fromEmail] && view !== "report") view = "blocked"; render(); } } };
}
