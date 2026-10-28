import type { Adapter, Ref } from "./decorator";

/**
 * ALL Gmail-specific selectors live in this one file (spec §17 #5). Gmail's markup changes without
 * notice — if badges or banners stop appearing, this is the only place to fix.
 * Selectors are based on Gmail's current web markup and need a smoke test on a real inbox.
 */
const attr = (e: Element | null | undefined, a: string) => e?.getAttribute(a) ?? undefined;

export const gmailAdapter: Adapter = {
  rows(): Ref[] {
    return [...document.querySelectorAll<HTMLElement>("tr.zA")].map((row) => {
      const slot = row.querySelector<HTMLElement>(".y6") ?? row.querySelector<HTMLElement>("td.a4W") ?? row;
      return {
        key: row,
        threadId: attr(row.querySelector("[data-legacy-thread-id]"), "data-legacy-thread-id"),
        fromEmail: attr(row.querySelector(".yX span[email], span.zF[email], span[email]"), "email")?.toLowerCase(),
        subject: row.querySelector(".bog")?.textContent ?? undefined,
        place: (host) => slot.prepend(host),
      };
    });
  },

  openMessages(): Ref[] {
    const subject = document.querySelector("h2.hP")?.textContent ?? undefined;
    const threadId = attr(document.querySelector("h2.hP[data-legacy-thread-id], [data-legacy-thread-id].hP"), "data-legacy-thread-id");
    return [...document.querySelectorAll<HTMLElement>("div.adn")]
      .filter((m) => m.offsetParent !== null)
      .map((m) => ({
        key: m,
        id: attr(m, "data-legacy-message-id") ?? attr(m.querySelector("[data-legacy-message-id]"), "data-legacy-message-id"),
        threadId,
        fromEmail: attr(m.querySelector("span.gD[email], .gD[email], span[email]"), "email")?.toLowerCase(),
        subject,
        place: (host) => m.parentElement?.insertBefore(host, m),
      }));
  },
};
