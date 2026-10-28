import { parse } from "tldts";

/** Domains run by governments / accredited academia — registration is restricted, so trust the suffix. */
export const TRUSTED_SUFFIXES = ["gov.in", "nic.in", "ac.in", "edu.in", "edu", "gov"];

export interface Brand { name: string; aliases: string[]; domains: string[] }

export const BRANDS: Brand[] = [
  { name: "amazon", aliases: ["amazon", "amazon pay", "aws"], domains: ["amazon.com", "amazon.in", "amazonses.com", "amazonaws.com", "amazon.co.uk"] },
  { name: "google", aliases: ["google", "gmail", "youtube"], domains: ["google.com", "google.co.in", "googlemail.com", "youtube.com", "googleusercontent.com", "accounts.google.com"] },
  { name: "microsoft", aliases: ["microsoft", "outlook", "office 365", "microsoft 365", "onedrive"], domains: ["microsoft.com", "microsoftonline.com", "live.com", "office.com", "outlook.com"] },
  { name: "apple", aliases: ["apple", "icloud"], domains: ["apple.com", "icloud.com"] },
  { name: "paypal", aliases: ["paypal"], domains: ["paypal.com", "paypal.in"] },
  { name: "sbi", aliases: ["sbi", "state bank of india"], domains: ["sbi.co.in", "onlinesbi.sbi", "sbicard.com", "sbi.bank.in"] },
  { name: "hdfc", aliases: ["hdfc", "hdfc bank"], domains: ["hdfcbank.com", "hdfcbank.net"] },
  { name: "icici", aliases: ["icici", "icici bank"], domains: ["icicibank.com"] },
  { name: "axis", aliases: ["axis bank"], domains: ["axisbank.com"] },
  { name: "flipkart", aliases: ["flipkart"], domains: ["flipkart.com"] },
  { name: "paytm", aliases: ["paytm"], domains: ["paytm.com"] },
  { name: "phonepe", aliases: ["phonepe"], domains: ["phonepe.com"] },
  { name: "linkedin", aliases: ["linkedin"], domains: ["linkedin.com"] },
  { name: "netflix", aliases: ["netflix"], domains: ["netflix.com"] },
  { name: "irctc", aliases: ["irctc"], domains: ["irctc.co.in", "irctc.com"] },
  { name: "npci", aliases: ["npci", "upi"], domains: ["npci.org.in"] },
  { name: "aicte", aliases: ["aicte"], domains: ["aicte-india.org"] },
  { name: "github", aliases: ["github"], domains: ["github.com"] },
];

/** Seed whitelist for the demo. In production this is the AICTE-shared list synced from the backend. */
export const DEFAULT_WHITELIST: string[] = [...new Set(BRANDS.flatMap((b) => b.domains))];

export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com", "hotmail.com",
  "live.com", "rediffmail.com", "proton.me", "protonmail.com", "icloud.com", "aol.com", "mail.com", "zoho.com",
]);

export const SUSPICIOUS_TLDS = new Set([
  "xyz", "top", "click", "work", "buzz", "loan", "icu", "rest", "fit", "gq", "tk", "ml", "cf", "ga",
  "monster", "cyou", "sbs", "link", "zip", "mov", "country", "kim", "review", "support", "cam",
]);

export function registrable(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  return parse(h).domain ?? h;
}

export function isWhitelisted(domain: string, extra: string[] = []): boolean {
  const d = registrable(domain);
  if (DEFAULT_WHITELIST.includes(d) || extra.map(registrable).includes(d)) return true;
  // freemail providers are never "trusted organisations"
  return TRUSTED_SUFFIXES.some((s) => d === s || d.endsWith("." + s));
}

/** Every registrable domain we treat as "the real one" when hunting for look-alikes. */
export function lookalikeTargets(extra: string[] = []): string[] {
  const all = [...DEFAULT_WHITELIST, ...extra].map(registrable);
  return [...new Set(all.filter((d) => !FREE_MAIL.has(d)))];
}
