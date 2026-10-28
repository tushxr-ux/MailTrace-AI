/**
 * MailTrace AI — Outlook Add-in task pane logic.
 *
 * Self-contained: all logic from packages/core inlined here so Office.js
 * (which has no Node module system) can load this as a plain <script>.
 *
 * Layer 1: header-only scan on Office.onReady (fast, no user prompt).
 * Layer 2: body scan only when user clicks "Deep Analysis" (one-time read).
 */

"use strict";

// ─── inlined from packages/core/src/whitelist.ts ──────────────────────────

const TRUSTED_SUFFIXES = ["gov.in", "nic.in", "ac.in", "edu.in", "edu", "gov"];

const BRANDS = [
  { name: "amazon",    aliases: ["amazon", "amazon pay", "aws"],              domains: ["amazon.com","amazon.in","amazonses.com","amazonaws.com","amazon.co.uk"] },
  { name: "google",    aliases: ["google", "gmail", "youtube"],               domains: ["google.com","google.co.in","googlemail.com","youtube.com","googleusercontent.com"] },
  { name: "microsoft", aliases: ["microsoft", "outlook", "office 365", "microsoft 365", "onedrive"], domains: ["microsoft.com","microsoftonline.com","live.com","office.com","outlook.com"] },
  { name: "apple",     aliases: ["apple", "icloud"],                          domains: ["apple.com","icloud.com"] },
  { name: "paypal",    aliases: ["paypal"],                                   domains: ["paypal.com","paypal.in"] },
  { name: "sbi",       aliases: ["sbi", "state bank of india"],               domains: ["sbi.co.in","onlinesbi.sbi","sbicard.com"] },
  { name: "hdfc",      aliases: ["hdfc", "hdfc bank"],                        domains: ["hdfcbank.com","hdfcbank.net"] },
  { name: "icici",     aliases: ["icici", "icici bank"],                      domains: ["icicibank.com"] },
  { name: "axis",      aliases: ["axis bank"],                                domains: ["axisbank.com"] },
  { name: "flipkart",  aliases: ["flipkart"],                                 domains: ["flipkart.com"] },
  { name: "paytm",     aliases: ["paytm"],                                    domains: ["paytm.com"] },
  { name: "phonepe",   aliases: ["phonepe"],                                  domains: ["phonepe.com"] },
  { name: "linkedin",  aliases: ["linkedin"],                                 domains: ["linkedin.com"] },
  { name: "netflix",   aliases: ["netflix"],                                  domains: ["netflix.com"] },
  { name: "irctc",     aliases: ["irctc"],                                    domains: ["irctc.co.in","irctc.com"] },
  { name: "github",    aliases: ["github"],                                   domains: ["github.com"] },
];

const DEFAULT_WHITELIST = [...new Set(BRANDS.flatMap(b => b.domains))];

const FREE_MAIL = new Set([
  "gmail.com","googlemail.com","yahoo.com","yahoo.in","yahoo.co.in","outlook.com","hotmail.com",
  "live.com","rediffmail.com","proton.me","protonmail.com","icloud.com","aol.com","mail.com","zoho.com",
]);

const SUSPICIOUS_TLDS = new Set([
  "xyz","top","click","work","buzz","loan","icu","rest","fit","gq","tk","ml","cf","ga",
  "monster","cyou","sbs","link","zip","mov","country","kim","review","support","cam",
]);

/** Minimal registrable-domain extraction without tldts (no npm in add-in). */
function registrable(host) {
  const h = host.toLowerCase().replace(/\.$/, "");
  // Well-known two-part suffixes
  const TWO = ["co.in","co.uk","com.au","com.br","org.in","net.in","ac.in","edu.in","gov.in","nic.in","edu.au","co.nz","org.uk","me.uk"];
  const parts = h.split(".");
  if (parts.length >= 3) {
    const last2 = parts.slice(-2).join(".");
    if (TWO.includes(last2) && parts.length >= 3) return parts.slice(-3).join(".");
  }
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return h;
}

function isWhitelisted(domain, extra = []) {
  const d = registrable(domain);
  if (DEFAULT_WHITELIST.includes(d) || extra.map(registrable).includes(d)) return true;
  return TRUSTED_SUFFIXES.some(s => d === s || d.endsWith("." + s));
}

// ─── inlined from packages/core/src/auth.ts ───────────────────────────────

const TRUSTED_AUTHSERV = [/(^|\.)google\.com$/i, /(^|\.)outlook\.com$/i, /(^|\.)protection\.outlook\.com$/i, /(^|\.)office365\.com$/i];
const VALID_RESULTS = ["pass","fail","softfail","neutral","none","temperror","permerror"];

function asResult(v) {
  const x = v.toLowerCase();
  return VALID_RESULTS.includes(x) ? x : "none";
}

function isTrustedAuthserv(id) {
  return !!id && TRUSTED_AUTHSERV.some(re => re.test(id));
}

function parseAuthResults(values) {
  const none = { spf: "none", dkim: "none", dmarc: "none", trusted: false };
  for (const raw of values) {
    const v = raw.replace(/\s+/g, " ").trim();
    const authservId = v.split(";")[0]?.trim().split(" ")[0];
    if (!isTrustedAuthserv(authservId)) continue;
    const grab = k => [...v.matchAll(new RegExp(`\\b${k}=(\\w+)`, "gi"))].map(m => asResult(m[1]));
    const first = arr => arr[0] ?? "none";
    const dkims = grab("dkim");
    return { spf: first(grab("spf")), dkim: dkims.includes("pass") ? "pass" : first(dkims), dmarc: first(grab("dmarc")), authservId, trusted: true };
  }
  return none;
}

// ─── inlined from packages/core/src/headers.ts ────────────────────────────

function decodeWords(s) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _cs, enc, text) => {
    try {
      if (enc.toUpperCase() === "B") {
        const bin = atob(text);
        return new TextDecoder("utf-8").decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
      }
      const bytes = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return new TextDecoder("utf-8").decode(Uint8Array.from(bytes, c => c.charCodeAt(0)));
    } catch { return text; }
  });
}

function parseAddress(value) {
  if (!value) return null;
  let email, name = "";
  const angle = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (angle) {
    email = angle[1];
    name = value.slice(0, angle.index).trim().replace(/^"+|"+$/g, "").trim();
  } else {
    const bare = value.match(/([^\s<>"',;]+@[^\s<>"',;]+)/);
    if (!bare) return null;
    email = bare[1];
  }
  email = email.toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const host = email.slice(at + 1).replace(/\.$/, "");
  return { name: decodeWords(name), email, host, domain: registrable(host) };
}

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];
function firstPublicIp(received) {
  for (const r of received) {
    for (const m of r.matchAll(/\[(\d{1,3}(?:\.\d{1,3}){3})\]/g)) {
      if (!PRIVATE.some(re => re.test(m[1]))) return m[1];
    }
  }
  return undefined;
}

function getHeaders(headers, name) {
  const n = name.toLowerCase();
  return headers.filter(h => h.name.toLowerCase() === n).map(h => h.value);
}

function parseHeaders(headers, messageIdFallback = "") {
  const from = parseAddress(getHeaders(headers, "From")[0]);
  if (!from) return null;
  const rp = getHeaders(headers, "Return-Path")[0];
  const received = getHeaders(headers, "Received");
  return {
    messageId: getHeaders(headers, "Message-ID")[0]?.trim() || messageIdFallback,
    from,
    replyTo: parseAddress(getHeaders(headers, "Reply-To")[0]) ?? undefined,
    returnPath: rp && rp.trim() !== "<>" ? parseAddress(rp) ?? undefined : undefined,
    subject: decodeWords(getHeaders(headers, "Subject")[0] ?? ""),
    received,
    auth: parseAuthResults(getHeaders(headers, "Authentication-Results")),
    originIp: firstPublicIp(received),
  };
}

// ─── inlined scoring / rules (minimal subset for header-only scan) ─────────

const REASONS = {
  auth_fail:        "This email failed to verify as coming from the real sender.",
  domain_new:       "This website/domain was created only a few days ago.",
  college:          "Sender domain doesn't match official college domain.",
  authority:        "This email claims to be from a senior person but isn't from an official address.",
  brand:            "This sender claims to be a trusted brand but isn't using its official domain.",
  lookalike:        "This domain looks similar to a trusted brand but isn't the real one.",
  first_time:       "This sender is new and hasn't emailed you before.",
  reply_to:         "Replies to this email would go to a different address.",
  reported:         "This sender has been reported for scams.",
  subject_pressure: "The subject uses urgent or payment wording common in scams.",
  freemail_authority:"This email claims an official role but comes from a free email address.",
  unusual_tld:      "This sender uses an unusual web address.",
  spoofed_trusted:  "This email pretends to be from a trusted sender but failed verification.",
  safe_verified:    "Sender verified and matches expected domain.",
  safe_generic:     "No red flags found.",
  generic_caution:  "Some details of this email look unusual — verify before acting.",
  scam_offer:       "This looks like a fake internship/course offer asking for payment.",
  link_mismatch:    "A link in this email goes somewhere different from what it says.",
  payment_request:  "This email asks you to pay a personal account — official bodies don't do that.",
  credential_request:"This email asks for passwords, OTPs or card details.",
};

const INSTITUTION_RE = /\b(principal|registrar|vice[- ]?chancellor|head of department|hod|placement (cell|officer|office)|training (and|&) placement|admissions?|examination|exam cell|scholarship|office of the dean|dean of|college|university|institute)\b/i;
const EXEC_RE = /\b(ceo|cfo|managing director|chairman|director|\bmd\b|boss|founder)\b/i;
const ROLE_RE = /\b(hr|recruiter|talent|support|helpdesk|security|admin|accounts?|billing|customer care|team|official|manager)\b/i;

function authPoints(v, fail, soft, none) {
  return v === "fail" || v === "permerror" ? fail : v === "softfail" ? soft : v === "none" || v === "neutral" || v === "temperror" ? none : 0;
}
const isRealFail = v => v === "fail" || v === "softfail" || v === "permerror";

/** Levenshtein distance (for lookalike detection). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const GLYPH_MAP = { "0":"o","1":"l","3":"e","4":"a","5":"s","7":"t","8":"b","9":"g","а":"a","е":"e","о":"o","р":"p","с":"c","х":"x","у":"y","і":"i" };
function normalizeDomain(s) {
  let out = s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  out = out.replace(/rn/g, "m").replace(/vv/g, "w");
  return [...out].map(c => GLYPH_MAP[c] ?? c).join("");
}

/** Extract the "SLD" (domain without TLD suffix) for lookalike comparison. */
function sldOf(domain) {
  const parts = domain.split(".");
  // strip known two-part TLDs
  const TWO = ["co","com","org","net","edu","gov","ac","nic"];
  if (parts.length >= 3 && TWO.includes(parts[parts.length - 2])) return parts.slice(0, -2).join(".");
  return parts.slice(0, -1).join(".");
}

function findLookalike(host, targets) {
  const reg = registrable(host);
  if (targets.includes(reg)) return null;
  const rawSld = sldOf(reg);
  const nsld = normalizeDomain(rawSld);
  let best = null;
  for (const t of targets) {
    const tsld = sldOf(t);
    if (tsld.length < 4) continue;
    if (nsld === normalizeDomain(tsld)) { best = { target: t, kind: rawSld === tsld ? "tld-swap" : "homoglyph" }; break; }
    const d = levenshtein(nsld, normalizeDomain(tsld));
    const limit = tsld.length <= 6 ? 1 : 2;
    if (d > 0 && d <= limit) { best = { target: t, kind: "typo" }; break; }
    if (tsld.length >= 5 && (nsld.includes(normalizeDomain(tsld)) || nsld.startsWith(normalizeDomain(tsld)) || nsld.endsWith(normalizeDomain(tsld)))) {
      best = { target: t, kind: "embedded" };
    }
  }
  return best;
}

function headerScan(meta) {
  const hits = [];
  const whitelisted = isWhitelisted(meta.from.domain, []);
  const lookalikeCandidates = DEFAULT_WHITELIST.filter(d => !FREE_MAIL.has(d));
  const lookalike = whitelisted ? null : findLookalike(meta.from.host, lookalikeCandidates);

  // Auth
  const spfP = authPoints(meta.auth.spf, 35, 15, 10);
  if (spfP) hits.push({ points: spfP, reasonKey: isRealFail(meta.auth.spf) ? "auth_fail" : null, note: `SPF ${meta.auth.spf}` });

  const dkimP = authPoints(meta.auth.dkim, 25, 25, 8);
  if (dkimP) hits.push({ points: dkimP, reasonKey: isRealFail(meta.auth.dkim) ? "auth_fail" : null, note: `DKIM ${meta.auth.dkim}` });

  const dmarcP = authPoints(meta.auth.dmarc, 35, 35, 10);
  if (dmarcP) hits.push({ points: dmarcP, reasonKey: isRealFail(meta.auth.dmarc) ? "auth_fail" : null, note: `DMARC ${meta.auth.dmarc}` });

  // Return-path mismatch
  if (meta.returnPath && meta.auth.dmarc !== "pass" && meta.returnPath.domain !== meta.from.domain) {
    hits.push({ points: 15, reasonKey: "auth_fail", note: `Return-Path (${meta.returnPath.domain}) ≠ From (${meta.from.domain})` });
  }

  // Reply-to mismatch
  if (meta.replyTo && meta.replyTo.domain !== meta.from.domain) {
    hits.push({ points: 15, reasonKey: "reply_to", note: `Reply-To (${meta.replyTo.domain}) ≠ From (${meta.from.domain})` });
  }

  // Lookalike
  if (lookalike) {
    const swap = lookalike.kind === "tld-swap";
    hits.push({ points: swap ? 20 : 50, reasonKey: "lookalike", note: `Look-alike (${lookalike.kind}) of ${lookalike.target}` });
  }

  // Display name claims
  if (!whitelisted && !FREE_MAIL.has(meta.from.domain)) {
    const n = meta.from.name;
    if (INSTITUTION_RE.test(n)) hits.push({ points: 30, reasonKey: "college", note: `Display name "${n}" claims an institution` });
    else if (EXEC_RE.test(n)) hits.push({ points: 30, reasonKey: "authority", note: `Display name "${n}" claims authority` });
    else {
      const lower = n.toLowerCase();
      for (const b of BRANDS) {
        const claims = b.aliases.some(a => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
        if (claims && !b.domains.map(registrable).includes(meta.from.domain)) {
          hits.push({ points: 30, reasonKey: "brand", note: `Display name "${n}" claims ${b.name}` });
          break;
        }
      }
    }
  }

  // Freemail authority
  if (FREE_MAIL.has(meta.from.domain)) {
    const n = meta.from.name;
    if (INSTITUTION_RE.test(n) || EXEC_RE.test(n) || ROLE_RE.test(n)) {
      hits.push({ points: 15, reasonKey: "freemail_authority", note: `Official-sounding name "${n}" on free-mail ${meta.from.domain}` });
    }
  }

  // Suspicious TLD
  const tld = meta.from.host.split(".").pop() ?? "";
  if (SUSPICIOUS_TLDS.has(tld)) hits.push({ points: 10, reasonKey: "unusual_tld", note: `Suspicious TLD .${tld}` });

  // Subject pressure
  const s = meta.subject;
  const HIGH_SUBJECT = /(account.{0,20}(limited|suspended|locked|blocked)|verify your (account|identity|email)|\bkyc\b|payment (failed|due|pending)|fee due|registration fee|refund|lottery|you('ve| have) won|unusual (sign.?in|activity)|security alert)/i;
  const MID_SUBJECT = /(urgent|immediately|action required|final notice|last chance|expires?|offer letter|internship|job opportunity|apply now|invoice)/i;
  if (HIGH_SUBJECT.test(s)) hits.push({ points: 20, reasonKey: "subject_pressure", note: `Subject pressure: "${s.slice(0, 60)}"` });
  else if (MID_SUBJECT.test(s)) hits.push({ points: 10, reasonKey: "subject_pressure", note: `Subject hint: "${s.slice(0, 60)}"` });

  const score = Math.min(100, hits.reduce((sum, h) => sum + h.points, 0));

  // Forced overrides
  const authAllPass = meta.auth.trusted && (meta.auth.dmarc === "pass" || (meta.auth.spf === "pass" && meta.auth.dkim === "pass"));
  const authFailed  = meta.auth.trusted && (meta.auth.dmarc === "fail" || (meta.auth.spf === "fail" && meta.auth.dkim === "fail"));

  let level, reasonKey;
  if (whitelisted && authFailed) {
    level = "red"; reasonKey = "spoofed_trusted";
  } else if (whitelisted && authAllPass) {
    level = "green"; reasonKey = "safe_verified";
  } else {
    level = score >= 60 ? "red" : score >= 25 ? "yellow" : "green";
    if (level === "green") {
      reasonKey = "safe_generic";
    } else {
      // pick highest-point hit with a reasonKey
      const withKey = hits.filter(h => h.reasonKey && h.points > 0).sort((a, b) => b.points - a.points);
      reasonKey = withKey[0]?.reasonKey ?? "generic_caution";
    }
  }

  return { level, score, reasonKey, reason: REASONS[reasonKey] ?? REASONS.generic_caution, hits, auth: meta.auth };
}

// ─── Deep analysis (body scan) ─────────────────────────────────────────────

const UPI_HANDLES = "ybl|ibl|axl|paytm|okaxis|okhdfcbank|okicici|oksbi|upi|apl|fbl|sbi|axisbank|icici|hdfcbank|pnb|idfcbank|kotak|airtel|jio";
const UPI_RE = new RegExp(`\\b[\\w.\\-]{2,}@(?:${UPI_HANDLES})\\b`, "gi");

const DEEP_PATTERNS = [
  { re: /(registration|processing|security|refundable|verification|training|enrolment|certificate|kit)\s+(fee|charges?|deposit|amount)/i, note: "Asks for a fee / deposit", reasonKey: "scam_offer" },
  { re: /(?:(?:pay|transfer|send|deposit)\b.{0,40}(?:₹|rs\.?|inr)\s?[\d,]+|(?:₹|rs\.?|inr)\s?[\d,]{3,}.{0,40}\b(?:pay|transfer|deposit|upi|fee)\b)/i, note: "Asks for a payment amount", reasonKey: "payment_request" },
  { re: /\b(otp|cvv|pin|password|card number|net ?banking|aadhaar|pan (card|number))\b/i, note: "Requests sensitive credentials", reasonKey: "credential_request" },
  { re: /\b(urgent(ly)?|within \d+ (hours?|minutes?)|last chance|final (notice|warning)|expires? (today|soon)|act now|limited (slots|seats))\b/i, note: "Creates time pressure" },
  { re: /\b(whatsapp|telegram|signal)\b.{0,40}(\+?\d[\d\s-]{8,}|join|contact|message)/i, note: "Moves conversation off-platform" },
  { re: /\b(selected|shortlisted|congratulations|offer letter|work from home|part[- ]time job|earn \S+ (per|a) (day|week|month))\b/i, note: "Job / internship bait language" },
  { re: /\b(lottery|prize|winner|reward points?|claim your)\b/i, note: "Prize / reward bait" },
];

function stripTags(html) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function analyzeBody(html) {
  const body = stripTags(html).slice(0, 20000);
  const findings = [];
  for (const p of DEEP_PATTERNS) {
    const m = body.match(p.re);
    if (m) findings.push({ note: p.note, phrase: m[0].trim().slice(0, 80), reasonKey: p.reasonKey });
  }
  const upiIds = [...new Set([...body.matchAll(UPI_RE)].map(m => m[0].toLowerCase()))];
  if (upiIds.length) findings.push({ note: `Personal UPI ID in email: ${upiIds.join(", ")}`, reasonKey: "payment_request" });

  // Link mismatch check
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    const label = stripTags(m[2]);
    const shown = label.match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#]\S*)?/i);
    if (!shown) continue;
    try {
      const actualDomain = registrable(new URL(href).hostname);
      const shownDomain = registrable(shown[1].toLowerCase());
      if (actualDomain !== shownDomain) {
        findings.push({ note: `Link text "${label.slice(0, 40)}" points to ${actualDomain}`, reasonKey: "link_mismatch" });
        break;
      }
    } catch { /* ignore invalid URLs */ }
  }
  return findings;
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

const root = () => document.getElementById("root");

function pillClass(val) {
  return ["pass","fail","softfail","none","neutral","temperror","permerror"].includes(val) ? val : "none";
}

function renderResult(result, fromAddr) {
  const { level, score, reason, hits, auth } = result;

  const authRow = ["spf","dkim","dmarc"].map(k =>
    `<span class="pill ${pillClass(auth[k])}">${k.toUpperCase()} ${auth[k]}</span>`
  ).join("");

  const hitList = hits.length
    ? hits.map(h => `<div class="finding">• ${h.note}</div>`).join("")
    : `<div class="finding" style="color:var(--muted)">No suspicious signals found in headers.</div>`;

  root().innerHTML = `
    <div class="card">
      <div class="risk-badge ${level}"><span class="dot"></span>${level.toUpperCase()} RISK · ${score}/100</div>
      <div class="sender-name">${escHtml(fromAddr.name || fromAddr.email)}</div>
      <div class="sender-email">${escHtml(fromAddr.email)}</div>
      <div class="reason">${escHtml(reason)}</div>
      <div class="auth-row">${authRow}</div>
    </div>

    <div class="card">
      <div class="deep-label">Header signals</div>
      ${hitList}
    </div>

    <button class="btn btn-deep" id="btnDeep">🔍 Deep Analysis (read body)</button>
    <div id="deepSection"></div>
  `;

  document.getElementById("btnDeep").addEventListener("click", onDeepClick);
}

function renderDeep(findings) {
  const sec = document.getElementById("deepSection");
  if (!sec) return;
  if (!findings.length) {
    sec.innerHTML = `<div class="card"><div class="deep-label">Body scan</div><div class="finding" style="color:var(--green)">✓ No suspicious content found in the email body.</div></div>`;
    return;
  }
  const rows = findings.map(f => `<div class="finding">• ${escHtml(f.note)}${f.phrase ? ` — <em style="color:var(--muted)">"${escHtml(f.phrase)}"</em>` : ""}</div>`).join("");
  sec.innerHTML = `<div class="card"><div class="deep-label">Body scan · ${findings.length} signal(s)</div>${rows}</div>`;
}

function renderError(msg) {
  root().innerHTML = `<div class="state-msg" style="color:var(--red)">⚠ ${escHtml(msg)}</div>`;
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── Office.js integration ───────────────────────────────────────────────────

let _item; // cached Office mail item reference

function onDeepClick() {
  const btn = document.getElementById("btnDeep");
  if (btn) { btn.disabled = true; btn.textContent = "Reading body…"; }

  _item.body.getAsync(Office.CoercionType.Html, { asyncContext: null }, result => {
    if (result.status === Office.AsyncResultStatus.Succeeded) {
      const findings = analyzeBody(result.value);
      renderDeep(findings);
    } else {
      const sec = document.getElementById("deepSection");
      if (sec) sec.innerHTML = `<div class="state-msg" style="color:var(--red)">⚠ Could not read body: ${escHtml(result.error?.message ?? "unknown error")}</div>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = "🔍 Re-run Deep Analysis"; }
  });
}

Office.onReady(() => {
  _item = Office.context.mailbox.item;
  if (!_item) { renderError("No mail item found. Open an email and try again."); return; }

  // Read internet headers (requires Mailbox requirement set 1.8 in OWA / new Outlook)
  // Fallback: use item.from + item.subject directly if headers API not available
  if (_item.internetHeaders && typeof _item.internetHeaders.getAsync === "function") {
    _item.internetHeaders.getAsync(
      ["From","Reply-To","Return-Path","Received","Authentication-Results","Message-ID","Subject"],
      result => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          // Fallback to basic item properties
          scanFromBasicProps();
          return;
        }
        // internetHeaders returns an object keyed by header name (case varies)
        const raw = [];
        for (const [name, value] of Object.entries(result.value ?? {})) {
          if (Array.isArray(value)) value.forEach(v => raw.push({ name, value: v }));
          else if (value) raw.push({ name, value });
        }
        const meta = parseHeaders(raw, _item.itemId ?? "");
        if (!meta) { scanFromBasicProps(); return; }
        const verdict = headerScan(meta);
        renderResult(verdict, meta.from);
      }
    );
  } else {
    scanFromBasicProps();
  }
});

function scanFromBasicProps() {
  // Minimal fallback when internetHeaders API is unavailable (older OWA, Outlook 2016).
  // Build a synthetic header set from the structured properties Office exposes.
  const item = _item;
  const fromAddr = item.from; // { displayName, emailAddress }

  // Synthesise a minimal From header so parseAddress works
  const fromStr = fromAddr
    ? `"${fromAddr.displayName}" <${fromAddr.emailAddress}>`
    : "";
  const subject = item.subject ?? "";

  const raw = [
    { name: "From", value: fromStr },
    { name: "Subject", value: subject },
  ];

  const replyTo = item.replyTo; // array of EmailAddressDetails or single
  if (replyTo) {
    const first = Array.isArray(replyTo) ? replyTo[0] : replyTo;
    if (first?.emailAddress) raw.push({ name: "Reply-To", value: `"${first.displayName || ""}" <${first.emailAddress}>` });
  }

  const meta = parseHeaders(raw, item.itemId ?? "");
  if (!meta) {
    renderError("Could not read sender information from this email.");
    return;
  }
  const verdict = headerScan(meta);
  renderResult(verdict, meta.from);
}
