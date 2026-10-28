import { parseAuthResults } from "./auth";
import { registrable } from "./whitelist";
import type { ParsedAddress, ParsedMetadata, RawHeader } from "./types";

function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _cs, enc, text) => {
    try {
      if (enc.toUpperCase() === "B") {
        const bin = atob(text);
        return new TextDecoder("utf-8").decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      }
      const bytes = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      return new TextDecoder("utf-8").decode(Uint8Array.from(bytes, (c: string) => c.charCodeAt(0)));
    } catch {
      return text;
    }
  });
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

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];
export function firstPublicIp(received: string[]): string | undefined {
  for (const r of received) {
    for (const m of r.matchAll(/\[(\d{1,3}(?:\.\d{1,3}){3})\]/g)) {
      if (!PRIVATE.some((re) => re.test(m[1]))) return m[1];
    }
  }
  return undefined;
}

export function getHeaders(headers: RawHeader[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === n).map((h) => h.value);
}

/** Turn raw Gmail/Graph/Office.js headers into the structure the rules engine works on. */
export function parseHeaders(headers: RawHeader[], messageIdFallback = ""): ParsedMetadata | null {
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
