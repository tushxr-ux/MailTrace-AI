import type { AuthResult, AuthSummary } from "./types";

const TRUSTED_AUTHSERV = [/(^|\.)google\.com$/i, /(^|\.)outlook\.com$/i, /(^|\.)protection\.outlook\.com$/i, /(^|\.)office365\.com$/i];

const VALID: AuthResult[] = ["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror"];
const asResult = (v: string): AuthResult => {
  const x = v.toLowerCase() as AuthResult;
  return VALID.includes(x) ? x : "none";
};

export function isTrustedAuthserv(id?: string): boolean {
  return !!id && TRUSTED_AUTHSERV.some((re) => re.test(id));
}

/**
 * Parse Authentication-Results header(s). Only a header stamped by Gmail / Outlook is trusted —
 * a sender can forge their own, so untrusted headers are ignored (everything → "none").
 */
export function parseAuthResults(values: string[]): AuthSummary {
  const none: AuthSummary = { spf: "none", dkim: "none", dmarc: "none", trusted: false };
  for (const raw of values) {
    const v = raw.replace(/\s+/g, " ").trim();
    const authservId = v.split(";")[0]?.trim().split(" ")[0];
    if (!isTrustedAuthserv(authservId)) continue;

    const grab = (k: string): AuthResult[] =>
      [...v.matchAll(new RegExp(`\\b${k}=(\\w+)`, "gi"))].map((m) => asResult(m[1]));
    const first = (arr: AuthResult[]): AuthResult => arr[0] ?? "none";
    const dkims = grab("dkim");
    return {
      spf: first(grab("spf")),
      dkim: dkims.includes("pass") ? "pass" : first(dkims),
      dmarc: first(grab("dmarc")),
      authservId,
      trusted: true,
    };
  }
  return none;
}
