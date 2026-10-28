import { useState } from "react";
import type { Api } from "../shared/types";

export function Onboarding({ api }: { api: Api }) {
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const steps = [
    { h: "We only read the envelope, never the letter.", p: "MailTrace AI checks who an email is from, whether that sender can be verified, and how old their domain is. It does not read your email body." },
    { h: "Connect Gmail with the smallest permission.", p: "Google will ask to share email metadata only — sender, subject and headers. If you ask for a report on one email, you'll be asked again, for that one email, once." },
    { h: "You're protected.", p: "Safe emails won't be interrupted. Risky ones get a clear red or yellow warning with one plain sentence on why, and you can block the sender in one click." },
  ];
  const s = steps[step];
  return (
    <main className="onboard">
      <img src="assets/logo-full.png" alt="MailTrace AI — Smarter Email. Safer You." />
      <div className="dots" aria-hidden>{steps.map((_, i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
      <h1>{s.h}</h1>
      <p>{s.p}</p>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        {step < 1 && <button className="btn primary big" onClick={() => setStep(1)}>Continue</button>}
        {step === 1 && (
          <button className="btn primary big" disabled={busy} onClick={async () => {
            setBusy(true); setErr("");
            try { await api.signIn(); await api.setSettings({ onboarded: true }); setStep(2); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't connect."); }
            setBusy(false);
          }}>{busy ? "Connecting…" : "Connect Gmail"}</button>
        )}
        {step === 2 && <button className="btn primary big" onClick={() => window.close()}>Done</button>}
        <a className="btn" href="testdrive.html">Try the test drive first</a>
      </div>
    </main>
  );
}
