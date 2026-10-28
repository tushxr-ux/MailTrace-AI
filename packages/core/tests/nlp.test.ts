import { describe, it, expect } from "vitest";
import { nlpScore } from "../src/nlp";

describe("nlpScore", () => {
  it("returns high probability for obvious scam text", () => {
    const scam = "You have been selected for internship. Pay registration fee of Rs 500 via UPI: fake@ybl. Act now!";
    expect(nlpScore(scam)).toBeGreaterThan(0.85);
  });

  it("returns low probability for benign text", () => {
    const ham = "Hi team, please find attached the meeting notes. Unsubscribe | Privacy Policy | Terms of Service";
    expect(nlpScore(ham)).toBeLessThan(0.25);
  });

  it("returns moderate probability for borderline text", () => {
    const mid = "Urgent: your account has been limited. Please verify your identity.";
    const p = nlpScore(mid);
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.95);
  });

  it("output is always 0-1", () => {
    expect(nlpScore("")).toBeGreaterThanOrEqual(0);
    expect(nlpScore("")).toBeLessThanOrEqual(1);
    expect(nlpScore("a".repeat(20000))).toBeGreaterThanOrEqual(0);
  });
});

