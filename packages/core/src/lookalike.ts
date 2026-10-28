import { parse } from "tldts";
import { registrable } from "./whitelist";

export type LookalikeKind = "homoglyph" | "typo" | "embedded" | "tld-swap";
export interface LookalikeMatch { target: string; kind: LookalikeKind; distance: number }

const MAP: Record<string, string> = {
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "$": "s", "@": "a", "!": "i", "|": "l",
  // common Cyrillic / Greek confusables
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s", "ј": "j", "ο": "o", "α": "a", "ν": "v",
};

export function normalize(s: string): string {
  let out = s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  out = out.replace(/rn/g, "m").replace(/vv/g, "w");
  return [...out].map((c) => MAP[c] ?? c).join("");
}

export function levenshtein(a: string, b: string): number {
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

const RANK: Record<LookalikeKind, number> = { homoglyph: 0, typo: 1, embedded: 2, "tld-swap": 3 };

/** Is `host` impersonating one of `targets`? Returns the best (most severe) match, or null. */
export function findLookalike(host: string, targets: string[]): LookalikeMatch | null {
  const p = parse(host.toLowerCase());
  const reg = p.domain;
  if (!reg) return null;
  if (targets.includes(reg)) return null;

  const rawSld = p.domainWithoutSuffix ?? "";
  const nsld = normalize(rawSld);
  const nsub = normalize(p.subdomain ?? "");
  let best: LookalikeMatch | null = null;
  const consider = (m: LookalikeMatch) => {
    if (!best || RANK[m.kind] < RANK[best.kind] || (m.kind === best.kind && m.distance < best.distance)) best = m;
  };

  for (const t of targets) {
    const tsld = parse(t).domainWithoutSuffix ?? "";
    if (tsld.length < 4) continue;
    if (nsld === tsld) {
      consider({ target: t, kind: rawSld === tsld ? "tld-swap" : "homoglyph", distance: 0 });
      continue;
    }
    const d = levenshtein(nsld, tsld);
    const limit = tsld.length <= 6 ? 1 : 2;
    if (d > 0 && d <= limit) { consider({ target: t, kind: "typo", distance: d }); continue; }
    if (tsld.length >= 5) {
      const tokens = nsld.split("-");
      if (tokens.includes(tsld) || nsld.startsWith(tsld) || nsld.endsWith(tsld) || nsub.includes(tsld)) {
        consider({ target: t, kind: "embedded", distance: Math.abs(nsld.length - tsld.length) });
      }
    }
  }
  return best;
}

export { registrable };
