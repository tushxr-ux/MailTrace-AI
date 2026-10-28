import { TOKENS_CSS } from "../shared/tokens";

export const BADGE_CSS = `${TOKENS_CSS}
:host { display: inline-flex; vertical-align: middle; margin-right: 8px; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 1px 9px 1px 7px; border-radius: 999px;
  font: 500 11.5px/18px "Google Sans", Roboto, system-ui, sans-serif; white-space: nowrap; cursor: default; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.red { background: var(--mt-red-wash); color: #A12127; } .red .dot { background: var(--mt-red); }
.yellow { background: var(--mt-amber-wash); color: #8A5A00; } .yellow .dot { background: var(--mt-amber); }
.green { background: var(--mt-green-wash); color: #1C6B33; } .green .dot { background: var(--mt-green); }
.green.quiet { background: transparent; padding: 1px 4px; } .green.quiet .label { display: none; }
`;

export const BANNER_CSS = `${TOKENS_CSS}
:host { display: block; margin: 8px 0 12px; font: 14px/1.5 "Google Sans", Roboto, system-ui, sans-serif; color: var(--mt-ink); }
.card { position: relative; background: var(--mt-white); border: 1px solid var(--mt-line); border-radius: 14px;
  padding: 14px 16px 14px 20px; box-shadow: 0 1px 2px rgba(11,31,75,.06); overflow: hidden; }
.card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--rail, var(--mt-blue)); }
.card.red { --rail: var(--mt-red); background: linear-gradient(90deg, var(--mt-red-wash), #fff 38%); }
.card.yellow { --rail: var(--mt-amber); background: linear-gradient(90deg, var(--mt-amber-wash), #fff 38%); }
.card.green { --rail: var(--mt-green); background: linear-gradient(90deg, var(--mt-green-wash), #fff 38%); }
.top { display: flex; gap: 12px; align-items: flex-start; }
.light { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; margin-top: 1px; }
.red .light { background: var(--mt-red); } .yellow .light { background: var(--mt-amber); } .green .light { background: var(--mt-green); }
.head { font-weight: 700; color: var(--mt-navy); font-size: 15px; display: flex; gap: 8px; align-items: center; }
.head img { width: 16px; height: 16px; opacity: .9; }
.reason { margin: 2px 0 0; font-size: 16px; line-height: 1.4; color: var(--mt-navy); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button, a.btn { font: 600 13px/1 "Google Sans", Roboto, system-ui, sans-serif; border-radius: 999px; padding: 9px 15px; cursor: pointer;
  border: 1px solid var(--mt-line); background: #fff; color: var(--mt-navy); text-decoration: none; display: inline-block; }
button:hover, a.btn:hover { background: var(--mt-wash); }
button:focus-visible, a.btn:focus-visible, summary:focus-visible { outline: 2px solid var(--mt-blue); outline-offset: 2px; }
button.primary { background: var(--mt-blue); border-color: var(--mt-blue); color: #fff; } button.primary:hover { background: var(--mt-blue-dark); }
button.danger { background: var(--mt-red); border-color: var(--mt-red); color: #fff; } button.danger:hover { background: #C93A3F; }
button[disabled] { opacity: .6; cursor: progress; }
.note { margin-top: 10px; font-size: 12px; color: var(--mt-muted); }
details { margin-top: 12px; border-top: 1px solid var(--mt-line); padding-top: 10px; }
summary { cursor: pointer; font-weight: 600; font-size: 13px; color: var(--mt-blue-dark); }
dl { margin: 10px 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 12.5px; }
dt { color: var(--mt-muted); } dd { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--mt-ink); }
.err { color: #A12127; font-size: 13px; margin-top: 8px; }
.report1930 { margin-top: 10px; font-size: 13px; } .report1930 a { color: var(--mt-blue-dark); font-weight: 600; }
@media (prefers-reduced-motion: no-preference) { .card { transition: background .2s ease; } }
`;
