import type { Intel, RawHeader } from "@mailtrace/core";

export interface Sample {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  when: string;
  preview: string;
  auth: { spf: string; dkim: string; dmarc: string };
  replyTo?: string;
  ip: string;
  intel: Intel;
  firstTime: boolean;
  /** only ever read after the user allows the one-time "View report" permission */
  body?: { text?: string; html?: string };
  note: string;
}

export const headersFor = (s: Sample): RawHeader[] => [
  { name: "From", value: s.from },
  { name: "Subject", value: s.subject },
  { name: "Message-ID", value: `<${s.id}@demo>` },
  { name: "Received", value: `from mail.example (mail.example. [${s.ip}]) by mx.google.com with ESMTPS` },
  ...(s.replyTo ? [{ name: "Reply-To", value: s.replyTo }] : []),
  { name: "Authentication-Results", value: `mx.google.com; spf=${s.auth.spf}; dkim=${s.auth.dkim}; dmarc=${s.auth.dmarc}` },
];

const AGE = (d: number, vt = 0): Intel => ({ domain: { ageDays: d, vtMalicious: vt }, ip: { abuseScore: vt ? 82 : 0, country: vt ? "RU" : "IN", city: vt ? "Moscow" : "Mumbai", asn: "AS12345", isp: vt ? "Example Hosting" : "Example Telecom" } });

export const SAMPLES: Sample[] = [
  {
    id: "m1", threadId: "t1", from: "Amazon Support <support@amaz0n-security.com>", subject: "Your account has been limited", when: "10:24 AM",
    preview: "We detected unusual activity on your account…", auth: { spf: "softfail", dkim: "none", dmarc: "none" }, ip: "185.220.101.4",
    intel: AGE(3, 11), firstTime: true, note: "Look-alike of amazon.com, brand-new domain, failed authentication.",
    body: { text: "Dear customer, your Amazon account is limited. Verify your account immediately and enter your card number, OTP and password to restore access." },
  },
  {
    id: "m2", threadId: "t2", from: "Careers <hr@company-careers.io>", subject: "Job opportunity – apply now", when: "9:41 AM",
    preview: "Hi, We came across your profile and…", auth: { spf: "pass", dkim: "none", dmarc: "none" }, ip: "34.120.45.8",
    intel: AGE(240), firstTime: true, note: "Authenticated, but a sender you've never heard from before.",
    body: { text: "Hi, we came across your profile and think you'd be a great fit for an opening. Reply with your resume and we'll schedule an interview." },
  },
  {
    id: "m3", threadId: "t3", from: "Billing <noreply@billing-service.com>", subject: "Your invoice is ready", when: "8:20 AM",
    preview: "Your invoice for October 2026 is attached…", auth: { spf: "pass", dkim: "pass", dmarc: "pass" }, ip: "52.94.236.248",
    intel: AGE(2890), firstTime: false, note: "Long-established domain, SPF/DKIM/DMARC all pass.",
  },
  {
    id: "m4", threadId: "t4", from: "Career Desk <internships@skillforge-careers.in>", subject: "Internship offer letter – confirm your seat", when: "Yesterday",
    preview: "Congratulations, you have been shortlisted for…", auth: { spf: "pass", dkim: "pass", dmarc: "pass" }, ip: "103.21.58.12",
    intel: AGE(9), firstTime: true, note: "Looks fine at the metadata level (yellow). The report reveals the payment trap (red).",
    body: { text: "Congratulations! You are shortlisted for a Data Science internship at a top MNC. To confirm your seat, pay a refundable registration fee of Rs. 2,000 to UPI ID skillforge.intern@ybl within 24 hours and your offer letter will be issued. Join our WhatsApp group +91 98765 43210." },
  },
  {
    id: "m5", threadId: "t5", from: '"Principal – XYZ College" <principal.xyzcollege@gmail.com>', subject: "Urgent: scholarship verification", when: "Yesterday",
    preview: "Dear student, your scholarship is on hold until…", auth: { spf: "pass", dkim: "pass", dmarc: "pass" }, ip: "209.85.220.41",
    intel: {}, firstTime: true, note: "Official-sounding name sent from a free email address.",
    body: { text: "Dear student, your scholarship is on hold. Send your Aadhaar number, bank account PIN and OTP to the principal's office immediately." },
  },
  {
    id: "m6", threadId: "t6", from: "SBI Alerts <alerts@sbi.co.in>", subject: "KYC update required", when: "Mon",
    preview: "Dear customer, your KYC is expiring…", auth: { spf: "fail", dkim: "fail", dmarc: "fail" }, ip: "45.155.205.7",
    intel: AGE(9000, 0), firstTime: false, note: "A trusted bank's name — but the email failed verification (spoofed).",
  },
  {
    id: "m7", threadId: "t7", from: "Amazon <no-reply@amazon.in>", subject: "Your order has shipped", when: "Mon",
    preview: "Your package is on the way and will arrive by…", auth: { spf: "pass", dkim: "pass", dmarc: "pass" }, ip: "54.240.8.20",
    intel: {}, firstTime: false, note: "Whitelisted domain with passing authentication.",
  },
];
