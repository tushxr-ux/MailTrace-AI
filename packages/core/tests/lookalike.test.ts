import { describe, expect, it } from "vitest";
import { findLookalike, levenshtein, lookalikeTargets, normalize } from "../src";

const T = lookalikeTargets();

describe("lookalike", () => {
  it("normalises homoglyphs", () => {
    expect(normalize("amaz0n")).toBe("amazon");
    expect(normalize("paypa1")).toBe("paypal");
    expect(normalize("rnicrosoft")).toBe("microsoft");
  });
  it("levenshtein", () => expect(levenshtein("kitten", "sitting")).toBe(3));

  it("flags digit-swap, typo, embedded brand and subdomain tricks", () => {
    expect(findLookalike("amaz0n.com", T)?.kind).toBe("homoglyph");
    expect(findLookalike("paypa1.com", T)?.kind).toBe("homoglyph");
    expect(findLookalike("microsfot.com", T)?.kind).toBe("typo");
    expect(findLookalike("amaz0n-security.com", T)).not.toBeNull();
    expect(findLookalike("amazon.com.account-verify.xyz", T)?.kind).toBe("embedded");
    expect(findLookalike("hdfcbank-kyc.in", T)?.target).toBe("hdfcbank.com");
  });
  it("flags TLD swaps as lowest severity", () => {
    expect(findLookalike("flipkart.shop", T)?.kind).toBe("tld-swap");
  });
  it("does not flag the real domains or unrelated ones", () => {
    expect(findLookalike("amazon.in", T)).toBeNull();
    expect(findLookalike("mail.google.com", T)).toBeNull();
    expect(findLookalike("randomstartup.io", T)).toBeNull();
    expect(findLookalike("github.com", T)).toBeNull();
  });
});
