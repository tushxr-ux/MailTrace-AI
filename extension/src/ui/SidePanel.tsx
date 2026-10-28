import { useMemo, useState } from "react";
import type { Api, AuditEntry, PanelState } from "../shared/types";
import { timeAgo } from "../shared/format";
import { ItemCard } from "./Report";
import { useApiState } from "./hooks";

const logoFull = "assets/logo-full.png";

const ACTION_LABEL: Record<AuditEntry["action"], string> = {
  metadata_scan: "Scanned sender details", deep_read: "Opened one email for a report", block: "Blocked a sender",
  unblock: "Unblocked a sender", sign_in: "Connected Gmail", clear_data: "Deleted local data",
};

function Summary({ state }: { state: PanelState }) {
  const open = state.items.filter((i) => !state.blocked[i.fromEmail]);
  const n = (l: string) => open.filter((i) => i.verdict.level === l).length;
  const rows = [
    { k: "red", n: n("red"), t: "Suspicious", s: "May be phishing or spoofed" },
    { k: "yellow", n: n("yellow"), t: "Needs verification", s: "Sender not recognised" },
    { k: "green", n: n("green"), t: "Safe", s: "Verified and trusted" },
  ];
  return (
    <section className="summary" aria-label="Scan summary">
      <p className="summary-title"><span className="tick">✓</span><b>Scan complete</b><span className="muted">{state.items.length} emails analysed</span></p>
      <ul>{rows.map((r) => (<li key={r.k}><span className={`light ${r.k}`} /><span className="num">{r.n}</span><span><b>{r.t}</b><em>{r.s}</em></span></li>))}</ul>
    </section>
  );
}

function PrivacyCard() {
  return (
    <aside className="privacy">
      <span className="lock" aria-hidden>🔒</span>
      <div>
        <b>We only analyse metadata.</b>
        <p>Your emails stay in your inbox. No content is uploaded. The body is read only if you ask for a report — once, for that one email.</p>
      </div>
    </aside>
  );
}

function Activity({ state }: { state: PanelState }) {
  return (
    <section className="tabpane">
      <h2>Permission log</h2>
      <p className="muted">Everything MailTrace AI did with your mailbox, so you can check our privacy claim yourself.</p>
      {state.audit.length === 0 ? <p className="empty">Nothing yet.</p> : (
        <ul className="log">
          {state.audit.slice(0, 60).map((a, i) => (
            <li key={i}>
              <span className={`body-flag ${a.bodyRead ? "yes" : "no"}`}>{a.bodyRead ? "Body read" : "No body"}</span>
              <span><b>{a.action === "deep_read" && a.result === "error" ? "Report cancelled — no email was opened" : ACTION_LABEL[a.action]}{a.count ? ` · ${a.count}` : ""}</b><em>{a.scope}{a.messageIdHash ? ` · msg ${a.messageIdHash}` : ""}</em></span>
              <time>{timeAgo(a.ts)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Settings({ state, api }: { state: PanelState; api: Api }) {
  const [confirm, setConfirm] = useState(false);
  const blocked = Object.keys(state.blocked);
  return (
    <section className="tabpane">
      <h2>Settings</h2>
      <label className="field"><span>Warning language</span>
        <select value={state.settings.lang} onChange={(e) => void api.setSettings({ lang: e.target.value as "en" | "hi" })}>
          <option value="en">English</option><option value="hi">हिन्दी (Hindi)</option>
        </select>
      </label>
      <label className="field"><span>Plan {state.demo ? "(demo toggle)" : ""}</span>
        <select value={state.settings.plan} onChange={(e) => void api.setSettings({ plan: e.target.value as "free" | "premium" })}>
          <option value="free">Free</option><option value="premium">Premium — sender location &amp; full forensics</option>
        </select>
      </label>
      <h3>Blocked senders</h3>
      {blocked.length === 0 ? <p className="empty">No blocked senders.</p> : (
        <ul className="plain">{blocked.map((e) => (<li key={e}><span>{e}</span><button className="btn small" onClick={() => void api.unblock(e)}>Unblock</button></li>))}</ul>
      )}
      <h3>Your data</h3>
      <p className="muted">Everything is stored on this device. Gmail block rules stay in Gmail until you unblock the sender.</p>
      {confirm
        ? <div className="actions"><button className="btn danger" onClick={() => { void api.clearData(); setConfirm(false); }}>Yes, delete everything</button><button className="btn" onClick={() => setConfirm(false)}>Cancel</button></div>
        : <button className="btn" onClick={() => setConfirm(true)}>Delete all local data</button>}
      {!state.demo && <p className="fine"><a href="testdrive.html" target="_blank" rel="noreferrer">Open the test drive</a> to try MailTrace AI on sample scam emails.</p>}
    </section>
  );
}

function Connect({ api, error }: { api: Api; error?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <section className="connect">
      <img src={logoFull} alt="MailTrace AI — Smarter Email. Safer You." />
      <h1>Connect Gmail to start protecting your inbox</h1>
      <p>MailTrace AI asks for the smallest permission Google offers: sender, subject and headers. It cannot read your email body unless you ask for a report on one email.</p>
      <button className="btn primary big" disabled={busy} onClick={async () => { setBusy(true); setErr(""); try { await api.signIn(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't connect."); } setBusy(false); }}>
        {busy ? "Connecting…" : "Connect Gmail"}
      </button>
      {(err || error) && <p className="err" role="alert">{err || error}</p>}
      <p className="fine"><a href="testdrive.html" target="_blank" rel="noreferrer">Or try the test drive with sample emails</a></p>
    </section>
  );
}

export function SidePanel({ api }: { api: Api }) {
  const { state } = useApiState(api);
  const [tab, setTab] = useState<"inbox" | "activity" | "settings">("inbox");
  const [filter, setFilter] = useState<"attention" | "blocked" | "all">("attention");

  const list = useMemo(() => {
    if (!state) return [];
    const isB = (e: string) => !!state.blocked[e];
    const rank = { red: 0, yellow: 1, green: 2 } as const;
    const items = [...state.items].sort((a, b) => rank[a.verdict.level] - rank[b.verdict.level] || b.ts - a.ts);
    return items.filter((i) => filter === "all" ? true : filter === "blocked" ? isB(i.fromEmail) : i.verdict.level !== "green" && !isB(i.fromEmail));
  }, [state, filter]);

  if (!state) return <div className="panel"><p className="muted pad">Loading…</p></div>;
  if (!state.signedIn && !state.demo) return <div className="panel"><Connect api={api} error={state.error} /></div>;

  return (
    <div className="panel">
      <header>
        <img src={logoFull} alt="MailTrace AI" className="logo" />
        <button className="btn small ghost" onClick={() => void api.scanNow()} title="Check for new mail now">Scan now</button>
      </header>
      {state.error && <p className="banner-err" role="alert">{state.error}</p>}
      <nav className="tabs" role="tablist">
        {(["inbox", "activity", "settings"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "inbox" ? "Inbox" : t === "activity" ? "Activity" : "Settings"}
          </button>
        ))}
      </nav>

      {tab === "inbox" && (
        <>
          <Summary state={state} />
          <div className="seg" role="group" aria-label="Filter">
            {([["attention", "Needs attention"], ["blocked", "Blocked"], ["all", "All"]] as const).map(([k, label]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          {list.length === 0
            ? <p className="empty">{filter === "blocked" ? "No blocked senders." : filter === "attention" ? "Nothing needs your attention. Safe emails stay out of your way." : "No emails scanned yet."}</p>
            : <ul className="items">{list.map((i) => <ItemCard key={i.id} item={i} state={state} api={api} />)}</ul>}
          <PrivacyCard />
        </>
      )}
      {tab === "activity" && <Activity state={state} />}
      {tab === "settings" && <Settings state={state} api={api} />}
    </div>
  );
}
