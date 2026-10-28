import { describe, expect, it } from "vitest";
import { parseAddress, parseHeaders, parseAuthResults } from "../src";
import { mail } from "./helpers";

describe("parseAddress", () => {
  it("handles quoted names, angle brackets and bare addresses", () => {
    expect(parseAddress('"Support Team" <Help@Amaz0n-Security.com>')).toMatchObject({ name: "Support Team", email: "help@amaz0n-security.com", domain: "amaz0n-security.com" });
    expect(parseAddress("a@mail.iitb.ac.in")).toMatchObject({ host: "mail.iitb.ac.in", domain: "iitb.ac.in" });
    expect(parseAddress("garbage")).toBeNull();
  });
  it("decodes RFC2047 display names", () => {
    expect(parseAddress("=?UTF-8?B?UHJpbmNpcGFs?= <p@x.com>")?.name).toBe("Principal");
  });
});

describe("parseAuthResults", () => {
  it("trusts only Gmail/Outlook stamped headers", () => {
    expect(parseAuthResults(["mx.google.com; spf=pass; dkim=pass; dmarc=pass"])).toMatchObject({ spf: "pass", dmarc: "pass", trusted: true });
    expect(parseAuthResults(["evil.example; spf=pass; dkim=pass; dmarc=pass"])).toMatchObject({ spf: "none", trusted: false });
  });
  it("picks the trusted header when a forged one comes first", () => {
    const r = parseAuthResults(["evil.example; dmarc=pass", "mx.google.com; dmarc=fail"]);
    expect(r.dmarc).toBe("fail");
  });
  it("takes any passing DKIM signature", () => {
    expect(parseAuthResults(["mx.google.com; dkim=fail; dkim=pass; spf=pass"]).dkim).toBe("pass");
  });
});

describe("parseHeaders", () => {
  it("extracts origin IP skipping private ranges", () => {
    const h = mail({ from: "a@b.com" });
    h.unshift({ name: "Received", value: "from x ([10.0.0.2]) by y" });
    expect(parseHeaders(h)?.originIp).toBe("203.0.113.9");
  });
  it("ignores empty Return-Path", () => {
    const h = mail({ from: "a@b.com", returnPath: "<>" });
    expect(parseHeaders(h)?.returnPath).toBeUndefined();
  });
});
