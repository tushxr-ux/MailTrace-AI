import type { DomainIntel, IpIntel, Plan } from "@mailtrace/core";
import { CONFIG } from "../shared/config";
import { get, set } from "./store";

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.lookupTimeoutMs);
  try {
    const res = await fetch(CONFIG.backendUrl + path, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", ...(CONFIG.clientToken ? { "X-Client-Token": CONFIG.clientToken } : {}) },
      body: JSON.stringify(body),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // backend down ⇒ local checks still produce a verdict
  } finally {
    clearTimeout(timer);
  }
}

/** PRIVACY: the ONLY things this module is ever allowed to send are a bare domain or an IP address. */
export const lookupDomain = (domain: string) => post<DomainIntel>("/v1/lookup/domain", { domain });
export const lookupIp = (ip: string, plan: Plan) => post<IpIntel>("/v1/lookup/ip", { ip, plan });
export const lookupDomains = (domains: string[]) =>
  domains.length ? post<(DomainIntel & { domain: string })[]>("/v1/lookup/urls", { domains: domains.slice(0, 20) }) : Promise.resolve(null);

export async function syncWhitelist(): Promise<void> {
  try {
    const cur = await get("whitelist");
    const res = await fetch(`${CONFIG.backendUrl}/v1/whitelist`, { headers: cur.etag ? { "If-None-Match": cur.etag } : {} });
    if (res.status === 304 || !res.ok) return;
    const j = (await res.json()) as { domains: string[] };
    await set("whitelist", { etag: res.headers.get("etag") ?? undefined, domains: j.domains });
  } catch { /* offline: keep the cached / built-in list */ }
}
