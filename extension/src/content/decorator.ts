import type { Api, PanelState, StoredItem } from "../shared/types";
import { createBanner, renderBadge, type Banner } from "./ui";

/** Where in the host page things live. Gmail & the test-drive page each provide one. */
export interface Ref {
  key: Element;
  id?: string;
  threadId?: string;
  fromEmail?: string;
  subject?: string;
  place(host: HTMLElement): void;
}
export interface Adapter { rows(): Ref[]; openMessages(): Ref[] }

export function findItem(items: StoredItem[], r: Ref): StoredItem | undefined {
  if (r.id) { const hit = items.find((i) => i.id === r.id); if (hit) return hit; }
  if (r.threadId) { const hit = items.filter((i) => i.threadId === r.threadId).sort((a, b) => b.ts - a.ts)[0]; if (hit) return hit; }
  const email = r.fromEmail?.toLowerCase();
  const subject = r.subject?.trim();
  if (email && subject) return items.find((i) => i.fromEmail === email && i.subject.trim() === subject);
  return undefined;
}

export function startDecorator(adapter: Adapter, api: Api, observeRoot: Node = document.body): () => void {
  let state: PanelState | null = null;
  const badges = new WeakMap<Element, { sig: string; host: HTMLElement }>();
  const banners = new WeakMap<Element, { id: string; banner: Banner }>();
  const live = new Set<Element>();

  function apply() {
    if (!state) return;
    const st = state;

    for (const ref of adapter.rows()) {
      const item = findItem(st.items, ref);
      const prev = badges.get(ref.key);
      if (!item) { prev?.host.remove(); badges.delete(ref.key); continue; }
      const sig = `${item.id}|${item.verdict.level}|${item.verdict.reasonKey}|${st.settings.lang}`;
      if (prev?.sig === sig && prev.host.isConnected) continue;
      prev?.host.remove();
      const host = renderBadge(item, st);
      ref.place(host);
      badges.set(ref.key, { sig, host });
    }

    const stillOpen = new Set<Element>();
    for (const ref of adapter.openMessages()) {
      const item = findItem(st.items, ref);
      const prev = banners.get(ref.key);
      if (!item || item.verdict.level === "green") { prev?.banner.host.remove(); banners.delete(ref.key); continue; }
      stillOpen.add(ref.key);
      if (prev && prev.id === item.id && prev.banner.host.isConnected) { prev.banner.update(item, st); continue; }
      prev?.banner.host.remove();
      const banner = createBanner(item, st, api);
      ref.place(banner.host);
      banners.set(ref.key, { id: item.id, banner });
    }
    for (const k of live) if (!stillOpen.has(k)) { banners.get(k)?.banner.host.remove(); banners.delete(k); }
    live.clear(); stillOpen.forEach((k) => live.add(k));
  }

  let t: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => { clearTimeout(t); t = setTimeout(apply, 200); };
  const refresh = async () => { try { state = await api.getState(); apply(); } catch { /* extension reloaded */ } };

  const mo = new MutationObserver((muts) => {
    // ignore our own shadow hosts to avoid feedback loops
    if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeName === "MAILTRACE-UI"))) return;
    schedule();
  });
  mo.observe(observeRoot, { childList: true, subtree: true });
  const unsub = api.subscribe(() => void refresh());
  void refresh();
  return () => { mo.disconnect(); unsub(); clearTimeout(t); };
}
