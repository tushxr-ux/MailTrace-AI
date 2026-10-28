import { parse } from "tldts";
import { getReason } from "./reasons";
import { levelFromScore, pickReason } from "./score";
import { registrable } from "./whitelist";
import type { DeepFindings, LinkInfo, RuleHit, Verdict, Lang, ReasonKey } from "./types";

/**
 * Layer 2 — runs ONLY after the user clicks "View Report" and grants one-time read access to a
 * single message. Everything here is pure & on-device: the body is never sent anywhere.
 */

const UPI_HANDLES = "ybl|ibl|axl|paytm|okaxis|okhdfcbank|okicici|oksbi|upi|apl|fbl|sbi|axisbank|icici|hdfcbank|pnb|barodampay|idfcbank|kotak|airtel|jio";
const UPI_RE = new RegExp(`\\b[\\w.\\-]{2,}@(?:${UPI_HANDLES})\\b`, "gi");

const PATTERNS: { re: RegExp; key: string; points: number; reasonKey?: ReasonKey; note: string }[] = [
  { re: /(registration|processing|security|refundable|verification|training|enrol?l?ment|certificate|kit)\s+(fee|charges?|deposit|amount)/i, key: "fee", points: 25, reasonKey: "scam_offer", note: "Asks for a fee / deposit" },
  { re: /(?:(?:pay|transfer|send|deposit)\b.{0,40}(?:₹|rs\.?|inr)\s?[\d,]+|(?:₹|rs\.?|inr)\s?[\d,]{3,}.{0,40}\b(?:pay|transfer|deposit|upi|fee)\b)/i, key: "pay", points: 20, reasonKey: "payment_request", note: "Asks for a payment amount" },
  { re: /\b(otp|cvv|pin|password|card number|net ?banking|aadhaar|pan (card|number))\b/i, key: "creds", points: 25, reasonKey: "credential_request", note: "Requests sensitive credentials" },
  { re: /\b(urgent(ly)?|immediately|within \d+ (hours?|minutes?)|last chance|final (notice|warning)|expires? (today|soon)|act now|limited (slots|seats))\b/i, key: "urgent", points: 10, note: "Creates time pressure" },
  { re: /\b(whatsapp|telegram|signal)\b.{0,40}(\+?\d[\d\s-]{8,}|join|contact|message)/i, key: "offplatform", points: 10, note: "Moves conversation to WhatsApp/Telegram" },
  { re: /\b(selected|shortlisted|congratulations|offer letter|work from home|part[- ]time job|earn \S+ (per|a) (day|week|month))\b/i, key: "bait", points: 10, note: "Job / internship bait language" },
  { re: /\b(lottery|prize|winner|reward points?|claim your)\b/i, key: "prize", points: 15, note: "Prize / reward bait" },
];

const stripTags = (html: string) =>
  html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const hostOf = (u: string): string | null => {
  try { return new URL(u).hostname; } catch { return null; }
};

/** Regex-based (service workers have no DOMParser). */
export function extractLinks(html: string, text: string): LinkInfo[] {
  const out: LinkInfo[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    const host = hostOf(href);
    if (!host) continue;
    const label = stripTags(m[2]);
    const shown = label.match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#]\S*)?/i);
    const domain = registrable(host);
    const mismatch = !!shown && registrable(parse(shown[1]).hostname ?? shown[1]) !== domain;
    if (!seen.has(href)) { seen.add(href); out.push({ text: label.slice(0, 80), href, domain, mismatch }); }
  }
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const href = m[0];
    const host = hostOf(href);
    if (host && !seen.has(href)) { seen.add(href); out.push({ text: href.slice(0, 80), href, domain: registrable(host), mismatch: false }); }
  }
  return out;
}

export interface DeepInput {
  text?: string;
  html?: string;
  /** probability (0-1) from the on-device ML classifier, when available */
  nlpProbability?: number;
}

export function analyzeBody({ text = "", html = "", nlpProbability }: DeepInput): DeepFindings {
  const body = (text || stripTags(html)).slice(0, 20000);
  const hits: RuleHit[] = [];
  const phrases: string[] = [];

  for (const p of PATTERNS) {
    const m = body.match(p.re);
    if (m) {
      phrases.push(m[0].trim().slice(0, 80));
      hits.push({ id: `D-${p.key}`, points: p.points, family: "content", reasonKey: p.reasonKey, note: p.note });
    }
  }
  const upiIds = [...new Set([...body.matchAll(UPI_RE)].map((m) => m[0].toLowerCase()))];
  if (upiIds.length) hits.push({ id: "D-upi", points: 25, family: "content", reasonKey: "payment_request", note: `Personal UPI ID requested: ${upiIds.join(", ")}` });

  // internship/job bait + money = the classic student scam; combine into the headline reason
  const keys = new Set(hits.map((h) => h.id));
  if ((keys.has("D-bait") || /intern/i.test(body)) && (keys.has("D-fee") || keys.has("D-pay") || upiIds.length)) {
    hits.push({ id: "D-combo", points: 30, family: "content", reasonKey: "scam_offer", note: "Job/internship bait combined with a payment request" });
  }

  const links = extractLinks(html, body);
  if (links.some((l) => l.mismatch)) hits.push({ id: "D-link", points: 25, family: "content", reasonKey: "link_mismatch", note: "A link's visible text differs from its real destination" });

  if (typeof nlpProbability === "number") {
    if (nlpProbability >= 0.8) hits.push({ id: "D-nlp", points: 35, family: "content", reasonKey: "scam_offer", note: `On-device classifier: ${(nlpProbability * 100).toFixed(0)}% scam` });
    else if (nlpProbability >= 0.5) hits.push({ id: "D-nlp", points: 15, family: "content", note: `On-device classifier: ${(nlpProbability * 100).toFixed(0)}% scam` });
  }

  const pts = hits.reduce((s, h) => s + h.points, 0);
  return {
    label: pts >= 50 ? "scam" : pts >= 20 ? "suspicious" : "clean",
    phrases, links, upiIds, hits,
    linkDomains: [...new Set(links.map((l) => l.domain))],
  };
}

/** Merge deep findings into an existing Layer-1 verdict (never lowers a red). */
export function applyDeep(v: Verdict, deep: DeepFindings, lang: Lang = "en"): Verdict {
  if (v.forced === "block" || v.forced === "allow") return { ...v, evidence: { ...v.evidence, deep } };
  const triggeredRules = [...v.evidence.triggeredRules, ...deep.hits];
  const score = Math.min(100, Math.max(v.score, 0) + deep.hits.reduce((s, h) => s + h.points, 0));
  let level = levelFromScore(score);
  if (v.level === "red") level = "red";
  const reasonKey = level === "green" ? v.reasonKey : (pickReason(triggeredRules) ?? v.reasonKey);
  return {
    ...v, score, level, reasonKey, reason: getReason(reasonKey, lang),
    evidence: { ...v.evidence, triggeredRules, deep, confidence: Math.min(0.99, v.evidence.confidence + (deep.hits.length ? 0.1 : 0)) },
  };
}
