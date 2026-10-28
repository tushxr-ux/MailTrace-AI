import type { Lang, Plan } from "@mailtrace/core";
import { getReason } from "@mailtrace/core";
import type { StoredItem } from "./types";

export const LEVEL_LABEL: Record<Lang, Record<"red" | "yellow" | "green", string>> = {
  en: { red: "High risk", yellow: "Caution", green: "Safe" },
  hi: { red: "ज़्यादा ख़तरा", yellow: "सावधान", green: "सुरक्षित" },
};

/** Short pill text for inbox rows (matches the deck's Gmail mockup). */
export function pillText(item: StoredItem, lang: Lang): string {
  const k = item.verdict.reasonKey;
  if (lang === "hi") return LEVEL_LABEL.hi[item.verdict.level];
  switch (item.verdict.level) {
    case "red":
      return k === "lookalike" ? "Suspicious – look-alike domain"
        : k === "blocked" ? "Blocked sender"
        : k === "spoofed_trusted" || k === "auth_fail" ? "Suspicious – spoofed sender"
        : "High risk";
    case "yellow": return "Verify sender";
    default: {
      const a = item.verdict.evidence.auth;
      return item.verdict.forced === "trusted" || (a.trusted && a.dmarc === "pass") ? "Safe – verified" : "Safe";
    }
  }
}

export const reasonOf = (item: StoredItem, lang: Lang) => getReason(item.verdict.reasonKey, lang);

export interface Row { label: string; value: string }

/** The forensic detail that lives behind the collapsed "Advanced Details" section. */
export function advancedRows(item: StoredItem, plan: Plan): Row[] {
  const e = item.verdict.evidence;
  const rows: Row[] = [
    { label: "Confidence", value: `${Math.round(e.confidence * 100)}%  (score ${item.verdict.score}/100)` },
    { label: "SPF / DKIM / DMARC", value: e.auth.trusted ? `${e.auth.spf} / ${e.auth.dkim} / ${e.auth.dmarc}` : "no trusted authentication result" },
    { label: "Sender domain", value: e.domain.name + (e.domain.inWhitelist ? "  (trusted list)" : "") },
  ];
  if (e.domain.lookalikeOf) rows.push({ label: "Imitates", value: e.domain.lookalikeOf });
  if (e.alignment.returnPath) rows.push({ label: "Return-Path", value: e.alignment.returnPath });
  if (e.alignment.replyTo) rows.push({ label: "Reply-To", value: e.alignment.replyTo });
  rows.push({ label: "Domain age", value: e.domain.ageDays == null ? "unknown" : `${e.domain.ageDays} days` });
  if (e.reputation.vtMalicious != null) rows.push({ label: "VirusTotal", value: `${e.reputation.vtMalicious} engine(s) flag it` });
  if (e.reputation.abuseScore != null) rows.push({ label: "AbuseIPDB", value: `${e.reputation.abuseScore}% abuse confidence` });
  if (e.ip) {
    rows.push({ label: "Sending IP", value: e.ip.addr });
    rows.push({
      label: "Location",
      value: plan === "premium"
        ? ([e.ip.city, e.ip.country].filter(Boolean).join(", ") || "not available") + (e.ip.isp ? ` · ${e.ip.isp}` : "")
        : "Premium feature",
    });
  }
  for (const r of e.triggeredRules) rows.push({ label: `Rule ${r.id}`, value: `${r.points >= 0 ? "+" : ""}${r.points}  ${r.note}` });
  if (e.deep) {
    if (e.deep.phrases.length) rows.push({ label: "Flagged phrases", value: e.deep.phrases.join(" · ") });
    for (const l of e.deep.links) if (l.mismatch) rows.push({ label: "Link mismatch", value: `shows “${l.text}” but goes to ${l.domain}` });
    if (e.deep.upiIds.length) rows.push({ label: "UPI IDs", value: e.deep.upiIds.join(", ") });
  }
  if (e.relayTrace.length) rows.push({ label: "Relay trace", value: e.relayTrace.slice(0, 4).map((r) => r.replace(/\s+/g, " ").slice(0, 140)).join("\n") });
  return rows;
}

export const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
