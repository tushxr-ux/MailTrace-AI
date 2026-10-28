import { useEffect, useMemo, useRef, useState } from "react";
import { parseAddress } from "@mailtrace/core";
import type { Adapter } from "../content/decorator";
import { startDecorator } from "../content/decorator";
import type { StoredItem } from "../shared/types";
import { SidePanel } from "../ui/SidePanel";
import { createMockApi } from "./mockApi";
import { SAMPLES } from "./samples";

const adapter: Adapter = {
  rows: () => [...document.querySelectorAll<HTMLElement>(".td-row")].map((row) => ({
    key: row, id: row.dataset.id, place: (host) => row.querySelector(".td-slot")?.prepend(host),
  })),
  openMessages: () => [...document.querySelectorAll<HTMLElement>(".td-msg")].map((m) => ({
    key: m, id: m.dataset.id, place: (host) => m.parentElement?.insertBefore(host, m),
  })),
};

export function TestDrive() {
  const [perm, setPerm] = useState<{ item: StoredItem; resolve: (ok: boolean) => void } | null>(null);
  const [openId, setOpenId] = useState<string | null>(new URLSearchParams(location.search).get("open"));
  const api = useMemo(() => createMockApi((item) => new Promise<boolean>((resolve) => setPerm({ item, resolve }))), []);
  const inbox = useRef<HTMLDivElement>(null);

  useEffect(() => (inbox.current ? startDecorator(adapter, api, inbox.current) : undefined), [api]);

  const open = SAMPLES.find((s) => s.id === openId);
  const answer = (ok: boolean) => { perm?.resolve(ok); setPerm(null); };

  return (
    <div className="td">
      <div className="td-note">
        <img src="assets/icons/icon-32.png" alt="" />
        <span><b>Test drive.</b> Sample emails, real detection engine. Nothing here touches your mailbox.</span>
      </div>
      <div className="td-grid">
        <div className="td-gmail" ref={inbox}>
          <aside className="td-side">
            <button className="td-compose">Compose</button>
            {["Inbox", "Starred", "Snoozed", "Sent", "Drafts"].map((l, i) => <div key={l} className={i === 0 ? "td-nav on" : "td-nav"}>{l}{i === 0 ? <b>{SAMPLES.length}</b> : null}</div>)}
          </aside>
          <section className="td-main">
            {!open ? (
              <div className="td-list">
                {SAMPLES.map((s) => {
                  const a = parseAddress(s.from)!;
                  return (
                    <div key={s.id} className="td-row" data-id={s.id} onClick={() => setOpenId(s.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)}>
                      <span className="td-from">{a.name || a.email}</span>
                      <span className="td-subj"><span className="td-slot" /><b>{s.subject}</b><em> — {s.preview}</em></span>
                      <span className="td-time">{s.when}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="td-thread">
                <button className="td-back" onClick={() => setOpenId(null)}>← Back to inbox</button>
                <h2>{open.subject}</h2>
                <div className="td-msg" data-id={open.id}>
                  <div className="td-msg-head"><b>{parseAddress(open.from)!.name}</b> <span>&lt;{parseAddress(open.from)!.email}&gt;</span><em>{open.when}</em></div>
                  <p>{open.body?.text ?? open.preview}</p>
                </div>
                <p className="td-hint">{open.note}</p>
              </div>
            )}
          </section>
        </div>
        <div className="td-panel"><SidePanel api={api} /></div>
      </div>

      {perm && (
        <div className="td-modal" role="dialog" aria-modal="true" aria-labelledby="permh">
          <div className="td-dialog">
            <img src="assets/icons/icon-48.png" alt="" />
            <h3 id="permh">Allow MailTrace AI to read this one email, once?</h3>
            <p><b>{perm.item.subject}</b><br /><span>from {perm.item.fromEmail}</span></p>
            <p>This is a one-time permission for a single email. The body is analysed on your device, then dropped. MailTrace AI keeps no access afterwards.</p>
            <div className="td-dialog-actions"><button className="btn" onClick={() => answer(false)}>Cancel</button><button className="btn primary" onClick={() => answer(true)}>Allow once</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
