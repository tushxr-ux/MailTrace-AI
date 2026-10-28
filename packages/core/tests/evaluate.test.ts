import { describe, expect, it } from "vitest";
import { run } from "./helpers";

// Mirrors spec §14.2 test matrix.
describe("evaluate — Layer 1 test matrix", () => {
  it("whitelisted domain + auth pass → GREEN, verified reason", () => {
    const v = run({ from: "Amazon <no-reply@amazon.in>" });
    expect(v.level).toBe("green");
    expect(v.forced).toBe("trusted");
    expect(v.reason).toBe("Sender verified and matches expected domain.");
  });

  it("whitelisted domain + DMARC fail → RED forced (spoofed trusted sender)", () => {
    const v = run({ from: "Amazon <no-reply@amazon.in>", spf: "fail", dkim: "fail", dmarc: "fail" });
    expect(v.level).toBe("red");
    expect(v.forced).toBe("spoofed_trusted");
    expect(v.reasonKey).toBe("spoofed_trusted");
  });

  it("amaz0n-security.com look-alike → RED with look-alike reason", () => {
    const v = run({ from: "support@amaz0n-security.com", subject: "Your account has been limited", spf: "softfail", dkim: "none", dmarc: "none" });
    expect(v.level).toBe("red");
    expect(v.reasonKey).toBe("lookalike");
    expect(v.evidence.domain.lookalikeOf).toBe("amazon.com");
  });

  it("domain created 3 days ago + failed auth → RED, new-domain or auth reason", () => {
    const v = run({ from: "hr@company-careers.io", dmarc: "fail", spf: "fail", dkim: "none" }, { domain: { ageDays: 3 } });
    expect(v.level).toBe("red");
    expect(["domain_new", "auth_fail"]).toContain(v.reasonKey);
  });

  it("brand-new domain alone → at least CAUTION with the domain-age sentence", () => {
    const v = run({ from: "hello@fresh-startup.io" }, { domain: { ageDays: 4 } });
    expect(v.level).toBe("yellow");
    expect(v.reason).toBe("This website/domain was created only a few days ago.");
  });

  it("first-time sender alone stays GREEN; with missing auth it becomes YELLOW with the first-time sentence", () => {
    const solo = run({ from: "someone@smallbiz.in" }, {}, { isFirstTimeSender: true });
    expect(solo.score).toBe(10);
    expect(solo.level).toBe("green"); // a new sender alone is not worth interrupting for
    const withNoAuth = run({ from: "someone@smallbiz.in", dmarc: "none", dkim: "none" }, {}, { isFirstTimeSender: true });
    expect(withNoAuth.level).toBe("yellow");
    expect(withNoAuth.reasonKey).toBe("first_time");
  });

  it("free-mail 'Principal' display name → YELLOW/RED with freemail or college reason", () => {
    const v = run({ from: '"Principal – XYZ College" <principal.xyz@gmail.com>' }, {}, { isFirstTimeSender: true });
    expect(["yellow", "red"]).toContain(v.level);
    expect(["freemail_authority", "college", "first_time"]).toContain(v.reasonKey);
  });

  it("non-whitelisted domain claiming a college → 'doesn't match official college domain'", () => {
    const v = run({ from: '"Training & Placement Cell, ABC College" <placement@abc-college-jobs.in>' }, {}, { isFirstTimeSender: true });
    expect(v.reason).toBe("Sender domain doesn't match official college domain.");
    expect(v.level).toBe("yellow");
  });

  it("official .ac.in college domain is trusted by suffix", () => {
    const v = run({ from: '"Principal" <principal@iitb.ac.in>' });
    expect(v.level).toBe("green");
  });

  it("user allow-listed sender → GREEN forced", () => {
    const v = run({ from: "x@amaz0n-security.com", dmarc: "fail" }, {}, { allowed: ["x@amaz0n-security.com"] });
    expect(v.level).toBe("green");
    expect(v.forced).toBe("allow");
  });

  it("blocked sender → RED forced; block beats allow", () => {
    const v = run({ from: "a@b.com" }, {}, { blocked: ["a@b.com"], allowed: ["a@b.com"] });
    expect(v.level).toBe("red");
    expect(v.forced).toBe("block");
  });

  it("VirusTotal ≥3 engines → RED reported reason", () => {
    const v = run({ from: "x@badsite.io", dmarc: "none", spf: "none", dkim: "none" }, { domain: { vtMalicious: 7, ageDays: 400 } });
    expect(v.level).toBe("red");
    expect(v.reasonKey).toBe("reported");
  });

  it("degraded intel (rate-limited) never crashes and never penalises", () => {
    const v = run({ from: "x@normalcompany.com" }, { domain: { degraded: true, ageDays: null } });
    expect(v.level).toBe("green");
  });

  it("forged Authentication-Results from a non-Gmail server is ignored (treated as none)", () => {
    const v = run({ from: "no-reply@amazon.in", authserv: "evil.example" });
    // whitelisted but no TRUSTED proof of auth → not auto-green
    expect(v.forced).toBeUndefined();
    expect(v.evidence.auth.trusted).toBe(false);
  });

  it("Reply-To mismatch is surfaced", () => {
    const v = run({ from: "ceo@acme-corp.com", replyTo: "ceo.office@gmail.com", dmarc: "none" }, {}, { isFirstTimeSender: true });
    expect(v.evidence.triggeredRules.some((r) => r.id === "R05")).toBe(true);
  });

  it("score is capped at 100 and keeps full rule list for Advanced Details", () => {
    const v = run({ from: "x@amaz0n-security.xyz", spf: "fail", dkim: "fail", dmarc: "fail", subject: "KYC urgent" }, { domain: { ageDays: 1, vtMalicious: 9 } });
    expect(v.score).toBe(100);
    expect(v.evidence.triggeredRules.length).toBeGreaterThan(4);
  });

  it("location is withheld from free plan, available on premium", () => {
    const free = run({ from: "a@b.com" }, { ip: { country: "RU", city: "Moscow" } });
    expect(free.evidence.ip?.country).toBeUndefined();
    const prem = run({ from: "a@b.com" }, { ip: { country: "RU", city: "Moscow" } }, { plan: "premium" });
    expect(prem.evidence.ip?.country).toBe("RU");
  });

  it("returns Hindi reasons when requested", () => {
    const v = run({ from: "x@amaz0n.com" }, {}, { lang: "hi" });
    expect(v.reason).toMatch(/[\u0900-\u097F]/);
  });
});
