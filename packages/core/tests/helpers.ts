import { parseHeaders, evaluate } from "../src";
import type { Intel, RawHeader, UserContext } from "../src";

export interface MailOpts {
  from: string; subject?: string; replyTo?: string; returnPath?: string;
  spf?: string; dkim?: string; dmarc?: string; authserv?: string; ip?: string;
}

export function mail(o: MailOpts): RawHeader[] {
  const h: RawHeader[] = [
    { name: "From", value: o.from },
    { name: "Subject", value: o.subject ?? "Hello" },
    { name: "Message-ID", value: "<t@x>" },
    { name: "Received", value: `from mail.sender.example (mail.sender.example. [${o.ip ?? "203.0.113.9"}]) by mx.google.com with ESMTPS` },
  ];
  if (o.replyTo) h.push({ name: "Reply-To", value: o.replyTo });
  if (o.returnPath) h.push({ name: "Return-Path", value: o.returnPath });
  h.push({
    name: "Authentication-Results",
    value: `${o.authserv ?? "mx.google.com"}; spf=${o.spf ?? "pass"} smtp.mailfrom=x; dkim=${o.dkim ?? "pass"} header.i=@x; dmarc=${o.dmarc ?? "pass"} header.from=x`,
  });
  return h;
}

export const ctx = (over: Partial<UserContext> = {}): UserContext => ({
  blocked: [], allowed: [], whitelist: [], isFirstTimeSender: false, plan: "free", lang: "en", ...over,
});

export function run(o: MailOpts, intel: Intel = {}, c: Partial<UserContext> = {}) {
  const meta = parseHeaders(mail(o))!;
  return evaluate(meta, intel, ctx(c));
}
