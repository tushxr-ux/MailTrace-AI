type Kid = Node | string | null | undefined | false;
interface Props { class?: string; text?: string; attrs?: Record<string, string>; on?: Record<string, (e: Event) => void> }

/** Safe element builder. Never uses innerHTML — display names & subjects are attacker-controlled. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (props.class) n.className = props.class;
  if (props.text !== undefined) n.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) n.setAttribute(k, v);
  for (const [ev, fn] of Object.entries(props.on ?? {})) n.addEventListener(ev, fn);
  for (const k of kids) if (k) n.append(k);
  return n;
}

export function shadowHost(css: string, className: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement("mailtrace-ui");
  host.className = className;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  root.append(style);
  return { host, root };
}
