import { BRANDS, FREE_MAIL, SUSPICIOUS_TLDS, isWhitelisted, registrable } from "./whitelist";
import type { LookalikeMatch } from "./lookalike";
import type { Intel, ParsedMetadata, RuleHit, UserContext } from "./types";
import { parse } from "tldts";

export interface RuleInput {
  meta: ParsedMetadata;
  intel: Intel;
  ctx: UserContext;
  whitelisted: boolean;
  lookalike: LookalikeMatch | null;
}
type Rule = (i: RuleInput) => RuleHit | null;

const INSTITUTION_RE =
  /\b(principal|registrar|vice[- ]?chancellor|head of department|hod|placement (cell|officer|office)|training (and|&) placement|admissions?|examination|exam cell|scholarship|office of the dean|dean of|college|university|institute)\b/i;
const EXEC_RE = /\b(ceo|cfo|managing director|chairman|director|\bmd\b|boss|founder)\b/i;
const ROLE_RE = /\b(hr|recruiter|talent|support|helpdesk|security|admin|accounts?|billing|customer care|team|official|manager)\b/i;

const ageHit = (days: number): RuleHit | null => {
  if (days < 7) return { id: "R06", points: 40, family: "domain", reasonKey: "domain_new", note: `Domain registered ${days} day(s) ago` };
  if (days < 30) return { id: "R07", points: 30, family: "domain", reasonKey: "domain_new", note: `Domain registered ${days} days ago` };
  if (days < 90) return { id: "R08", points: 15, family: "domain", reasonKey: "domain_new", note: `Domain registered ${days} days ago` };
  return null;
};

const authPoints = (v: string, fail: number, soft: number, none: number) =>
  v === "fail" || v === "permerror" ? fail : v === "softfail" ? soft : v === "none" || v === "neutral" || v === "temperror" ? none : 0;
/** Only a real failure earns the "failed to verify" sentence — a missing record is not a failure. */
const isRealFail = (v: string) => v === "fail" || v === "softfail" || v === "permerror";

export const RULES: Rule[] = [
  // ---- authentication --------------------------------------------------------------------------
  ({ meta }) => {
    const p = authPoints(meta.auth.spf, 35, 15, 10);
    return p ? { id: "R01", points: p, family: "auth", reasonKey: isRealFail(meta.auth.spf) ? "auth_fail" : undefined, note: `SPF ${meta.auth.spf}` } : null;
  },
  ({ meta }) => {
    const p = authPoints(meta.auth.dkim, 25, 25, 8);
    return p ? { id: "R02", points: p, family: "auth", reasonKey: isRealFail(meta.auth.dkim) ? "auth_fail" : undefined, note: `DKIM ${meta.auth.dkim}` } : null;
  },
  ({ meta }) => {
    const p = authPoints(meta.auth.dmarc, 35, 35, 10);
    return p ? { id: "R03", points: p, family: "auth", reasonKey: isRealFail(meta.auth.dmarc) ? "auth_fail" : undefined, note: `DMARC ${meta.auth.dmarc}` } : null;
  },
  ({ meta }) => {
    const rp = meta.returnPath;
    if (!rp || meta.auth.dmarc === "pass") return null;
    return rp.domain !== meta.from.domain
      ? { id: "R04", points: 15, family: "auth", reasonKey: "auth_fail", note: `Return-Path (${rp.domain}) ≠ From (${meta.from.domain})` }
      : null;
  },
  ({ meta }) =>
    meta.replyTo && meta.replyTo.domain !== meta.from.domain
      ? { id: "R05", points: 15, family: "auth", reasonKey: "reply_to", note: `Reply-To (${meta.replyTo.domain}) ≠ From (${meta.from.domain})` }
      : null,

  // ---- domain ------------------------------------------------------------------------------------
  ({ intel }) => {
    const d = intel.domain;
    if (!d) return null;
    if (typeof d.ageDays === "number") return ageHit(d.ageDays);
    return d.ageDays === null && !d.degraded
      ? { id: "R06", points: 5, family: "domain", note: "Domain age unknown (registry hides creation date)" }
      : null;
  },
  ({ lookalike }) => {
    if (!lookalike) return null;
    const swap = lookalike.kind === "tld-swap";
    return {
      id: "R09", points: swap ? 20 : 50, family: "domain", reasonKey: "lookalike",
      note: `Look-alike (${lookalike.kind}) of ${lookalike.target}`,
    };
  },
  ({ meta, whitelisted }) => {
    if (whitelisted || FREE_MAIL.has(meta.from.domain)) return null; // free-mail is handled by R11
    const n = meta.from.name;
    if (INSTITUTION_RE.test(n)) return { id: "R10", points: 30, family: "domain", reasonKey: "college", note: `Display name "${n}" claims an institution; domain ${meta.from.domain} not whitelisted` };
    if (EXEC_RE.test(n)) return { id: "R10", points: 30, family: "domain", reasonKey: "authority", note: `Display name "${n}" claims authority; domain ${meta.from.domain} not whitelisted` };
    const lower = n.toLowerCase();
    for (const b of BRANDS) {
      const claims = b.aliases.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
      if (claims && !b.domains.map(registrable).includes(meta.from.domain)) {
        return { id: "R10", points: 30, family: "domain", reasonKey: "brand", note: `Display name "${n}" claims ${b.name}; domain ${meta.from.domain} is not theirs` };
      }
    }
    return null;
  },
  ({ meta }) => {
    if (!FREE_MAIL.has(meta.from.domain)) return null;
    const n = meta.from.name;
    return INSTITUTION_RE.test(n) || EXEC_RE.test(n) || ROLE_RE.test(n)
      ? { id: "R11", points: 15, family: "domain", reasonKey: "freemail_authority", note: `Official-sounding name "${n}" on free-mail ${meta.from.domain}` }
      : null;
  },
  ({ meta }) => {
    const tld = parse(meta.from.host).publicSuffix?.split(".").pop() ?? "";
    return SUSPICIOUS_TLDS.has(tld) ? { id: "R13", points: 10, family: "domain", reasonKey: "unusual_tld", note: `Suspicious TLD .${tld}` } : null;
  },

  // ---- behaviour / subject ----------------------------------------------------------------------
  ({ ctx }) => (ctx.isFirstTimeSender ? { id: "R12", points: 10, family: "behavior", reasonKey: "first_time", note: "First email from this sender" } : null),
  ({ meta }) => {
    const s = meta.subject;
    const high = /(account.{0,20}(limited|suspended|locked|blocked|on hold)|verify your (account|identity|email)|\bkyc\b|payment (failed|due|pending)|fee due|registration fee|processing fee|refund|lottery|you('ve| have) won|winner|unusual (sign.?in|activity)|security alert)/i;
    const mid = /(urgent|immediately|action required|final notice|last chance|expires?|offer letter|internship|job opportunity|apply now|invoice)/i;
    if (high.test(s)) return { id: "R14", points: 20, family: "content", reasonKey: "subject_pressure", note: `Subject pressure wording: "${s}"` };
    if (mid.test(s)) return { id: "R14", points: 10, family: "content", reasonKey: "subject_pressure", note: `Subject hint wording: "${s}"` };
    return null;
  },

  // ---- reputation (backend lookups) ------------------------------------------------------------
  ({ intel }) => {
    const m = intel.domain?.vtMalicious ?? 0;
    if (m >= 3) return { id: "R15", points: 40, family: "reputation", reasonKey: "reported", note: `VirusTotal: ${m} engines flag the domain` };
    if (m >= 1) return { id: "R15", points: 15, family: "reputation", reasonKey: "reported", note: `VirusTotal: ${m} engine(s) flag the domain` };
    return null;
  },
  ({ intel }) => {
    const a = intel.ip?.abuseScore ?? 0;
    return a > 50 ? { id: "R16", points: 25, family: "reputation", reasonKey: "reported", note: `AbuseIPDB confidence ${a}%` } : null;
  },
];

export const authAllPass = (m: ParsedMetadata) =>
  m.auth.trusted && (m.auth.dmarc === "pass" || (m.auth.spf === "pass" && m.auth.dkim === "pass"));

export const authFailed = (m: ParsedMetadata) =>
  m.auth.trusted && (m.auth.dmarc === "fail" || (m.auth.spf === "fail" && m.auth.dkim === "fail"));

export { isWhitelisted };
