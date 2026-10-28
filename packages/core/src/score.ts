import { findLookalike } from "./lookalike";
import { getReason } from "./reasons";
import { RULES, authAllPass, authFailed } from "./rules";
import { isWhitelisted, lookalikeTargets } from "./whitelist";
import type { Forced, Intel, Level, ParsedMetadata, ReasonKey, RuleHit, UserContext, Verdict } from "./types";

export const BANDS = { cautionFrom: 25, redFrom: 60 } as const;

export const levelFromScore = (score: number): Level =>
  score >= BANDS.redFrom ? "red" : score >= BANDS.cautionFrom ? "yellow" : "green";

/** Priority when several rules tie on points — more decisive reasons first. */
const KEY_PRIORITY: ReasonKey[] = [
  "spoofed_trusted", "lookalike", "brand", "college", "authority", "auth_fail", "reported", "payment_request",
  "credential_request", "scam_offer", "link_mismatch", "domain_new", "reply_to", "freemail_authority",
  "first_time", "subject_pressure", "unusual_tld",
];

export function pickReason(hits: RuleHit[]): ReasonKey | null {
  const withKey = hits.filter((h) => h.reasonKey && h.points > 0);
  if (!withKey.length) return null;
  withKey.sort(
    (a, b) => b.points - a.points || KEY_PRIORITY.indexOf(a.reasonKey!) - KEY_PRIORITY.indexOf(b.reasonKey!),
  );
  return withKey[0].reasonKey!;
}

export function confidenceFor(level: Level, hits: RuleHit[], score: number, meta: ParsedMetadata, forced?: Forced): number {
  if (forced === "block" || forced === "allow") return 1;
  if (level === "green") {
    const passes = [meta.auth.spf, meta.auth.dkim, meta.auth.dmarc].filter((x) => x === "pass").length;
    return Math.min(0.99, 0.5 + 0.15 * passes + (forced === "trusted" ? 0.05 : 0));
  }
  const families = new Set(hits.filter((h) => h.points > 0).map((h) => h.family)).size;
  return Math.min(0.99, 0.35 + 0.2 * families + Math.min(score, 100) / 400);
}

/**
 * Layer-1 verdict from metadata only. Pure & synchronous — runs in the extension's service worker,
 * the Outlook add-in, and the mobile background task alike. Decision order mirrors spec §9.3.
 */
export function evaluate(meta: ParsedMetadata, intel: Intel, ctx: UserContext): Verdict {
  const email = meta.from.email;
  const whitelisted = isWhitelisted(meta.from.domain, ctx.whitelist) || !!intel.domain?.inWhitelist;
  const lookalike = whitelisted ? null : findLookalike(meta.from.host, lookalikeTargets(ctx.whitelist));

  const hits: RuleHit[] = [];
  for (const rule of RULES) {
    const h = rule({ meta, intel, ctx, whitelisted, lookalike });
    if (h) hits.push(h);
  }

  let forced: Forced | undefined;
  let level: Level;
  let reasonKey: ReasonKey;
  let score = Math.min(100, hits.reduce((s, h) => s + h.points, 0));

  if (ctx.blocked.includes(email)) {
    forced = "block"; level = "red"; reasonKey = "blocked"; score = 100;
    hits.push({ id: "R17", points: 0, family: "behavior", note: "Sender is on the user's block list" });
  } else if (ctx.allowed.includes(email)) {
    forced = "allow"; level = "green"; reasonKey = "allowed"; score = 0;
    hits.push({ id: "R18", points: 0, family: "behavior", note: "Sender is on the user's allow list" });
  } else if (whitelisted && authFailed(meta)) {
    forced = "spoofed_trusted"; level = "red"; reasonKey = "spoofed_trusted"; score = Math.max(score, 80);
    hits.push({ id: "R20", points: 0, family: "auth", reasonKey: "spoofed_trusted", note: `Trusted domain ${meta.from.domain} failed authentication` });
  } else if (whitelisted && authAllPass(meta)) {
    forced = "trusted"; level = "green"; reasonKey = "safe_verified"; score = Math.max(0, score - 30);
    hits.push({ id: "R19", points: -30, family: "auth", note: `Trusted domain ${meta.from.domain} with passing authentication` });
  } else {
    level = levelFromScore(score);
    reasonKey = level === "green" ? "safe_generic" : (pickReason(hits) ?? "generic_caution");
  }

  const evidence: Verdict["evidence"] = {
    auth: { spf: meta.auth.spf, dkim: meta.auth.dkim, dmarc: meta.auth.dmarc, trusted: meta.auth.trusted },
    alignment: { fromDomain: meta.from.domain, returnPath: meta.returnPath?.domain, replyTo: meta.replyTo?.domain },
    domain: {
      name: meta.from.domain, ageDays: intel.domain?.ageDays, inWhitelist: whitelisted, lookalikeOf: lookalike?.target,
    },
    reputation: { vtMalicious: intel.domain?.vtMalicious, abuseScore: intel.ip?.abuseScore },
    relayTrace: meta.received,
    triggeredRules: hits,
    confidence: confidenceFor(level, hits, score, meta, forced),
  };
  // Location / origin is premium + advanced-only (spec §5.2, note §3).
  if (meta.originIp && ctx.plan === "premium") {
    evidence.ip = { addr: meta.originIp, country: intel.ip?.country, city: intel.ip?.city, asn: intel.ip?.asn, isp: intel.ip?.isp };
  } else if (meta.originIp) {
    evidence.ip = { addr: meta.originIp };
  }

  return { messageId: meta.messageId, level, score, reason: getReason(reasonKey, ctx.lang), reasonKey, forced, evidence };
}
