export type Level = "green" | "yellow" | "red";
export type Lang = "en" | "hi";
export type Plan = "free" | "premium";
export type AuthResult =
  | "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror";
export type Family = "auth" | "domain" | "reputation" | "content" | "behavior";
export type Forced = "block" | "allow" | "spoofed_trusted" | "trusted";

export interface RawHeader { name: string; value: string }

export interface ParsedAddress {
  name: string;
  email: string;
  /** full host after the @, e.g. mail.example.co.in */
  host: string;
  /** registrable domain, e.g. example.co.in */
  domain: string;
}

export interface AuthSummary {
  spf: AuthResult;
  dkim: AuthResult;
  dmarc: AuthResult;
  authservId?: string;
  /** true only when the header was stamped by Gmail / Outlook, not by the sender */
  trusted: boolean;
}

export interface ParsedMetadata {
  messageId: string;
  from: ParsedAddress;
  replyTo?: ParsedAddress;
  returnPath?: ParsedAddress;
  subject: string;
  received: string[];
  auth: AuthSummary;
  /** first public IP found in the Received chain = connecting MTA */
  originIp?: string;
}

/** Returned by the backend. Only ever derived from a domain / IP — never user data. */
export interface DomainIntel {
  ageDays?: number | null;
  vtMalicious?: number;
  vtSuspicious?: number;
  inWhitelist?: boolean;
  degraded?: boolean;
}
export interface IpIntel {
  abuseScore?: number;
  country?: string;
  city?: string;
  asn?: string;
  isp?: string;
  degraded?: boolean;
}
export interface Intel { domain?: DomainIntel; ip?: IpIntel }

export interface UserContext {
  /** lower-case email addresses */
  blocked: string[];
  allowed: string[];
  /** extra whitelisted registrable domains (college domain, synced AICTE list) */
  whitelist: string[];
  isFirstTimeSender: boolean;
  plan: Plan;
  lang: Lang;
}

export type ReasonKey =
  | "auth_fail" | "domain_new" | "college" | "authority" | "brand" | "lookalike"
  | "first_time" | "reply_to" | "reported" | "subject_pressure" | "freemail_authority"
  | "unusual_tld" | "spoofed_trusted" | "blocked" | "allowed" | "safe_verified"
  | "safe_generic" | "generic_caution" | "scam_offer" | "link_mismatch"
  | "payment_request" | "credential_request";

export interface RuleHit {
  id: string;
  points: number;
  note: string;
  family: Family;
  reasonKey?: ReasonKey;
}

export interface LinkInfo { text: string; href: string; domain: string; mismatch: boolean }

export interface DeepFindings {
  label: "clean" | "suspicious" | "scam";
  phrases: string[];
  links: LinkInfo[];
  upiIds: string[];
  hits: RuleHit[];
  /** domains (only) that may be sent to the backend for reputation lookup */
  linkDomains: string[];
}

export interface Verdict {
  messageId: string;
  level: Level;
  score: number;
  /** ONE plain-language sentence — the only thing shown by default */
  reason: string;
  reasonKey: ReasonKey;
  forced?: Forced;
  /** shown only inside the collapsed "Advanced Details" */
  evidence: {
    auth: { spf: AuthResult; dkim: AuthResult; dmarc: AuthResult; trusted: boolean };
    alignment: { fromDomain: string; returnPath?: string; replyTo?: string };
    domain: { name: string; ageDays?: number | null; inWhitelist: boolean; lookalikeOf?: string };
    reputation: { vtMalicious?: number; abuseScore?: number };
    ip?: { addr: string; country?: string; city?: string; asn?: string; isp?: string };
    relayTrace: string[];
    triggeredRules: RuleHit[];
    deep?: DeepFindings;
    confidence: number;
  };
}
