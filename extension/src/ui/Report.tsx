import { useState } from "react";
import type { Api, PanelState, StoredItem } from "../shared/types";
import { advancedRows, LEVEL_LABEL, pillText, reasonOf, timeAgo } from "../shared/format";

export function Pill({ item, lang }: { item: StoredItem; lang: "en" | "hi" }) {
  return <span className={`pill ${item.verdict.level}`}><i className="dot" />{pillText(item, lang)}</span>;
}

export function ItemCard({ item, state, api, startOpen = false }: { item: StoredItem; state: PanelState; api: Api; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState<"" | "report" | "block" | "safe">("");
  const [err, setErr] = useState("");
  const lang = state.settings.lang;
  const isBlocked = !!state.blocked[item.fromEmail];
  const lvl = item.verdict.level;

  const act = async (kind: typeof busy, fn: () => Promise<unknown>) => {
    setErr(""); setBusy(kind);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy("");
  };

  return (
    <li className={`item ${lvl}${open ? " open" : ""}`}>
      <button className="item-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`light ${lvl}`} aria-hidden />
        <span className="who">
          <b>{item.fromName || item.fromEmail}</b>
          <span className="addr">{item.fromName ? item.fromEmail : ""}</span>
        </span>
        <span className="when">{timeAgo(item.ts)}</span>
        <span className="subject">{item.subject}</span>
        <Pill item={item} lang={lang} />
      </button>

      {open && (
        <div className="item-body">
          <p className="verdict"><span className="verdict-label">{LEVEL_LABEL[lang][lvl]}</span>{reasonOf(item, lang)}</p>
          <div className="actions">
            {isBlocked
              ? <button className="btn" disabled={!!busy} onClick={() => act("block", () => api.unblock(item.fromEmail))}>Unblock sender</button>
              : <button className="btn danger" disabled={!!busy} onClick={() => act("block", () => api.block(item.fromEmail))}>{busy === "block" ? "Blocking…" : "Block sender"}</button>}
            <button className="btn primary" disabled={!!busy} onClick={() => act("report", () => api.requestReport(item.id))}>
              {busy === "report" ? "Reading once…" : item.deepRead ? "Refresh report" : "View report"}
            </button>
            {lvl !== "green" && !isBlocked && <button className="btn" disabled={!!busy} onClick={() => act("safe", () => api.markSafe(item.fromEmail))}>Mark as safe</button>}
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {item.deepRead && <p className="fine">Read once for this report. The email body was not stored.</p>}
          {lvl === "red" && item.deepRead && (
            <p className="fine">Lost money or shared details? Report at <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a> or call 1930.</p>
          )}
          <details>
            <summary>Advanced details</summary>
            <dl>{advancedRows(item, state.settings.plan).map((r, i) => (<div key={i}><dt>{r.label}</dt><dd>{r.value}</dd></div>))}</dl>
          </details>
        </div>
      )}
    </li>
  );
}
