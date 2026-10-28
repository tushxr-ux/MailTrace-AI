import { describe, expect, it } from "vitest";
import { analyzeBody, applyDeep } from "../src";
import { run } from "./helpers";

describe("deep layer", () => {
  const scam = `Congratulations! You are shortlisted for a Data Science internship. Pay a refundable registration fee of Rs. 2,000
    to UPI ID hrdesk.intern@ybl within 24 hours to confirm your offer letter. Contact us on WhatsApp +91 98765 43210.`;

  it("detects the classic student internship scam", () => {
    const d = analyzeBody({ text: scam });
    expect(d.label).toBe("scam");
    expect(d.upiIds).toContain("hrdesk.intern@ybl");
    expect(d.hits.map((h) => h.id)).toEqual(expect.arrayContaining(["D-fee", "D-upi", "D-combo"]));
  });

  it("leaves normal mail clean", () => {
    expect(analyzeBody({ text: "Hi, attached are the notes from today's lecture. See you Monday." }).label).toBe("clean");
  });

  it("catches links whose visible text differs from destination", () => {
    const d = analyzeBody({ html: '<p>Login at <a href="https://evil-login.xyz/a">https://www.sbi.co.in/login</a></p>' });
    expect(d.links[0].mismatch).toBe(true);
    expect(d.linkDomains).toContain("evil-login.xyz");
    expect(d.hits.some((h) => h.id === "D-link")).toBe(true);
  });

  it("escalates a layer-1 yellow to red with the scam-offer reason", () => {
    const v = run({ from: "someone@smallbiz.in", dmarc: "none", dkim: "none" }, {}, { isFirstTimeSender: true });
    expect(v.level).toBe("yellow");
    const merged = applyDeep(v, analyzeBody({ text: scam }));
    expect(merged.level).toBe("red");
    expect(merged.reason).toBe("This looks like a fake internship/course offer asking for payment.");
    expect(merged.evidence.deep?.phrases.length).toBeGreaterThan(0);
  });

  it("never lowers a red, and leaves user-forced verdicts alone", () => {
    const red = run({ from: "x@amaz0n.com", dmarc: "fail", spf: "fail" });
    expect(applyDeep(red, analyzeBody({ text: "hello" })).level).toBe("red");
    const blocked = run({ from: "a@b.com" }, {}, { blocked: ["a@b.com"] });
    expect(applyDeep(blocked, analyzeBody({ text: scam })).forced).toBe("block");
  });
});
