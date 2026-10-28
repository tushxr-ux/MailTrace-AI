/**
 * MailTrace AI — standalone mobile engine
 * No imports from packages/core (monorepo not available in React Native).
 * Ported from: packages/core/src/{auth,headers,score,deep}.ts
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Level = "green" | "yellow" | "red";

export interface RawHeader { name: string; value: string }

export interface AuthSummary {
  spf: string; dkim: string; dmarc: string; trusted: boolean;
}

export interface ParsedAddress {
  name: string; email: string; host: string; domain: string;
}

export interface GmailMeta {
  id: string;
  headers: RawHeader[];
  snippet?: string;
}

export interface ScoredEmail {
  id: string;
  from: string;       // display name or email
  subject: string;
  level: Level;
  reason: string;
  score: number;
}

export interface RuleHit {
  id: string; points: number; note: string; reasonKey?: string; family?: string;
}

export interface DeepReport {
  label: "scam" | "suspicious" | "clean";
  hits: RuleHit[];
  phrases: string[];
  upiIds: string[];
}

export interface DeepInput { text?: string; html?: string }

// ─── Auth parsing (from packages/core/src/auth.ts) ────────────────────────────

const TRUSTED_AUTHSERV = [
  /(^|\.)google\.com$/i,
  /(^|\.)outlook\.com$/i,
  /(^|\.)protection\.outlook\.com$/i,
  /(^|\.)office365\.com$/i,
];

const VALID_RESULTS = ["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror"];
const asResult = (v: string) => (VALID_RESULTS.includes(v.toLowerCase()) ? v.toLowerCase() : "none");

export function parseAuthResults(values: string[]): AuthSummary {
  const none: AuthSummary = { spf: "none", dkim: "none", dmarc: "none", trusted: false };
  for (const raw of values) {
    const v = raw.replace(/\s+/g, " ").trim();
    const authservId = v.split(";")[0]?.trim().split(" ")[0];
    if (!TRUSTED_AUTHSERV.some((re) => re.test(authservId ?? ""))) continue;
    const grab = (k: string) =>
      [...v.matchAll(new RegExp(`\\b${k}=(\\w+)`, "gi"))].map((m) => asResult(m[1]));
    const first = (arr: string[]) => arr[0] ?? "none";
    const dkims = grab("dkim");
    return {
      spf: first(grab("spf")),
      dkim: dkims.includes("pass") ? "pass" : first(dkims),
      dmarc: first(grab("dmarc")),
      trusted: true,
    };
  }
  return none;
}

// ─── Address parsing (from packages/core/src/headers.ts) ─────────────────────

function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _cs, enc, text) => {
    try {
      if (enc.toUpperCase() === "B") {
        // atob is available in React Native's Hermes JS engine
        const bin = atob(text);
        return new TextDecoder("utf-8").decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      }
      const bytes = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      return new TextDecoder("utf-8").decode(Uint8Array.from(bytes, (c: string) => c.charCodeAt(0)));
    } catch { return text; }
  });
}

/** Extract registrable domain (e.g. "mail.google.com" → "google.com"). Simple version without tldts. */
function registrable(host: string): string {
  const parts = host.replace(/\.$/, "").split(".");
  if (parts.length <= 2) return host;
  // Known 2-part TLDs
  const last2 = parts.slice(-2).join(".");
  const known2 = ["co.uk", "co.in", "com.au", "org.uk", "net.in", "co.nz", "ac.uk"];
  if (known2.includes(last2) && parts.length >= 3) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function parseAddress(value: string | undefined): ParsedAddress | null {
  if (!value) return null;
  let email: string;
  let name = "";
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

function getHeader(headers: RawHeader[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === n).map((h) => h.value);
}

// ─── Scoring (from packages/core/src/score.ts, simplified) ───────────────────

const BANDS = { cautionFrom: 25, redFrom: 60 };
const FREEMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com", "icloud.com", "aol.com"]);

export function scoreEmail(meta: GmailMeta): ScoredEmail {
  const headers = meta.headers;
  const fromRaw = getHeader(headers, "From")[0] ?? "";
  const subject = decodeWords(getHeader(headers, "Subject")[0] ?? "(no subject)");
  const from = parseAddress(fromRaw);
  const displayFrom = from ? (from.name || from.email) : fromRaw;

  const auth = parseAuthResults(getHeader(headers, "Authentication-Results"));

  const hits: RuleHit[] = [];

  // Auth failure — strongest signal
  if (auth.trusted) {
    if (auth.spf === "fail" || auth.dkim === "fail") {
      hits.push({ id: "R1", points: 60, note: "SPF/DKIM hard fail", reasonKey: "auth_fail", family: "auth" });
    } else if (auth.spf === "softfail") {
      hits.push({ id: "R2", points: 30, note: "SPF softfail", reasonKey: "auth_fail", family: "auth" });
    } else if (auth.dmarc === "fail") {
      hits.push({ id: "R3", points: 40, note: "DMARC fail", reasonKey: "auth_fail", family: "auth" });
    }
  }

  // Reply-To mismatch
  const replyTo = parseAddress(getHeader(headers, "Reply-To")[0]);
  if (replyTo && from && replyTo.domain !== from.domain) {
    hits.push({ id: "R4", points: 20, note: "Reply-To domain differs from From domain", reasonKey: "reply_to", family: "routing" });
  }

  // Return-Path mismatch
  const returnPathRaw = getHeader(headers, "Return-Path")[0];
  const returnPath = returnPathRaw && returnPathRaw.trim() !== "<>" ? parseAddress(returnPathRaw) : null;
  if (returnPath && from && returnPath.domain !== from.domain) {
    hits.push({ id: "R5", points: 15, note: "Return-Path domain differs from From domain", reasonKey: "reply_to", family: "routing" });
  }

  // Freemail sending as authority brand
  if (from && FREEMAIL_DOMAINS.has(from.domain)) {
    const name = from.name.toLowerCase();
    const BRANDS = ["bank", "paypal", "amazon", "google", "microsoft", "apple", "noreply", "support", "admin", "security", "team", "official"];
    if (BRANDS.some((b) => name.includes(b))) {
      hits.push({ id: "R6", points: 30, note: "Freemail address with authority display name", reasonKey: "freemail_authority", family: "identity" });
    }
  }

  // Subject pressure words
  const PRESSURE = /\b(urgent|immediately|verify|suspended|unusual sign|account.*locked|action required|confirm.*account|limited time|click now)\b/i;
  if (PRESSURE.test(subject)) {
    hits.push({ id: "R7", points: 15, note: "Urgent/pressure language in subject", reasonKey: "subject_pressure", family: "content" });
  }

  const score = Math.min(100, hits.reduce((s, h) => s + h.points, 0));
  const level: Level = score >= BANDS.redFrom ? "red" : score >= BANDS.cautionFrom ? "yellow" : "green";

  const topHit = hits.sort((a, b) => b.points - a.points)[0];
  const reason = topHit?.note ?? (auth.trusted && auth.spf === "pass" && auth.dkim === "pass" ? "Auth verified" : "No major risk signals");

  return { id: meta.id, from: displayFrom, subject, level, reason, score };
}

// ─── Body analysis (from packages/core/src/deep.ts) ──────────────────────────

const UPI_HANDLES = "ybl|ibl|axl|paytm|okaxis|okhdfcbank|okicici|oksbi|upi|apl|fbl|sbi|axisbank|icici|hdfcbank|pnb|barodampay|idfcbank|kotak|airtel|jio";
const UPI_RE = new RegExp(`\\b[\\w.\\-]{2,}@(?:${UPI_HANDLES})\\b`, "gi");

const PATTERNS: { re: RegExp; key: string; points: number; reasonKey?: string; note: string }[] = [
  { re: /(registration|processing|security|refundable|verification|training|enrol?l?ment|certificate|kit)\s+(fee|charges?|deposit|amount)/i, key: "fee", points: 25, reasonKey: "scam_offer", note: "Asks for a fee / deposit" },
  { re: /(?:(?:pay|transfer|send|deposit)\b.{0,40}(?:₹|rs\.?|inr)\s?[\d,]+|(?:₹|rs\.?|inr)\s?[\d,]{3,}.{0,40}\b(?:pay|transfer|deposit|upi|fee)\b)/i, key: "pay", points: 20, reasonKey: "payment_request", note: "Asks for a payment amount" },
  { re: /\b(otp|cvv|pin|password|card number|net ?banking|aadhaar|pan (card|number))\b/i, key: "creds", points: 25, reasonKey: "credential_request", note: "Requests sensitive credentials" },
  { re: /\b(urgent(ly)?|immediately|within \d+ (hours?|minutes?)|last chance|final (notice|warning)|expires? (today|soon)|act now|limited (slots|seats))\b/i, key: "urgent", points: 10, note: "Creates time pressure" },
  { re: /\b(whatsapp|telegram|signal)\b.{0,40}(\+?\d[\d\s-]{8,}|join|contact|message)/i, key: "offplatform", points: 10, note: "Moves conversation to WhatsApp/Telegram" },
  { re: /\b(selected|shortlisted|congratulations|offer letter|work from home|part[- ]time job|earn \S+ (per|a) (day|week|month))\b/i, key: "bait", points: 10, note: "Job / internship bait language" },
  { re: /\b(lottery|prize|winner|reward points?|claim your)\b/i, key: "prize", points: 15, note: "Prize / reward bait" },
];

const stripTags = (html: string) =>
  html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

export function analyzeBody({ text = "", html = "" }: DeepInput): DeepReport {
  const body = (text || stripTags(html)).slice(0, 20000);
  const hits: RuleHit[] = [];
  const phrases: string[] = [];

  for (const p of PATTERNS) {
    const m = body.match(p.re);
    if (m) {
      phrases.push(m[0].trim().slice(0, 80));
      hits.push({ id: `D-${p.key}`, points: p.points, reasonKey: p.reasonKey, note: p.note, family: "content" });
    }
  }

  const upiIds = [...new Set([...body.matchAll(UPI_RE)].map((m) => m[0].toLowerCase()))];
  if (upiIds.length) hits.push({ id: "D-upi", points: 25, reasonKey: "payment_request", note: `Personal UPI ID found: ${upiIds.join(", ")}`, family: "content" });

  // Internship + money = classic student scam combo
  const keys = new Set(hits.map((h) => h.id));
  if ((keys.has("D-bait") || /intern/i.test(body)) && (keys.has("D-fee") || keys.has("D-pay") || upiIds.length)) {
    hits.push({ id: "D-combo", points: 30, reasonKey: "scam_offer", note: "Job/internship bait + payment request combo", family: "content" });
  }

  const pts = hits.reduce((s, h) => s + h.points, 0);
  return {
    label: pts >= 50 ? "scam" : pts >= 20 ? "suspicious" : "clean",
    phrases,
    upiIds,
    hits,
  };
}
