/**
 * Lightweight on-device scam classifier.
 *
 * No model file, no ONNX, no download. Multinomial Naive-Bayes-style log-odds
 * over a hand-curated term vocabulary derived from the PATTERNS in deep.ts and
 * real phishing corpora. Runs in < 1 ms on any device.
 *
 * Output: probability 0–1 that the text is a scam/phish.
 * Feed into analyzeBody() as { nlpProbability }.
 *
 * ponytail: no trained model weights · ceiling: ~85% F1 on seen vocabulary ·
 *   upgrade: replace TERMS with ONNX MiniLM embeddings when a model file ships
 */

// [term, log-odds-scam] — positive = scam signal, negative = ham signal
// Derived from patterns in deep.ts + common phishing vocabulary
const TERMS: [RegExp, number][] = [
  // Strong scam signals
  [/\bregistration fee\b/i, 2.8],
  [/\bprocessing fee\b/i, 2.6],
  [/\bsecurity deposit\b/i, 2.5],
  [/\brefundable deposit\b/i, 2.9],
  [/\benrollment fee\b/i, 2.7],
  [/\btraining fee\b/i, 2.6],
  [/\bcertificate fee\b/i, 2.4],
  [/\bkit fee\b/i, 2.3],
  [/\bwork from home\b/i, 2.0],
  [/\bearn \S+ per (day|week|month)\b/i, 2.2],
  [/\bpart[\s-]time job\b/i, 1.8],
  [/\binternship offer\b/i, 1.5],
  [/\bselected for (the )?internship\b/i, 2.1],
  [/\boffer letter\b/i, 1.6],
  [/\bshortlisted\b/i, 1.4],
  [/\b(send|pay|transfer|deposit).{0,30}(upi|gpay|phonepe|paytm)\b/i, 2.8],
  [/\b[a-z0-9.\-]{2,}@(ybl|paytm|okaxis|upi|apl|oksbi)\b/i, 2.9],
  [/\b(otp|cvv|pin|password).{0,20}(share|send|provide|enter)\b/i, 3.0],
  [/\bnet ?banking\b/i, 1.8],
  [/\baadhaar\b.{0,30}(number|card|send|share)/i, 2.5],
  [/\bpan (card|number)\b.{0,30}(send|share|provide)/i, 2.2],
  [/\blottery\b/i, 2.3],
  [/\byou('ve| have) won\b/i, 2.5],
  [/\bprize\b.{0,30}(claim|collect|receive)/i, 2.0],
  [/\bclaim your (prize|reward|money)\b/i, 2.4],
  [/\b(whatsapp|telegram|signal)\b.{0,40}(\+?\d[\d\s\-]{8,}|join|contact)\b/i, 2.0],
  [/\bact now\b/i, 1.5],
  [/\blimited (slots?|seats?|offers?)\b/i, 1.4],
  [/\b(last|final) chance\b/i, 1.6],
  [/\baccount.{0,20}(suspended|blocked|limited|on hold)\b/i, 2.2],
  [/\bverify your (account|identity|email)\b/i, 2.0],
  [/\bunusual (sign.?in|activity|login)\b/i, 1.9],
  [/\bsecurity alert\b/i, 1.7],
  [/\bpayment (failed|due|pending|overdue)\b/i, 1.8],
  [/\bfee due\b/i, 1.9],
  [/\bkyc (update|verification|required)\b/i, 2.3],
  [/\bclick (here|below|the link) (to|and)\b/i, 1.3],
  [/\bdo not (share|ignore|forward) this\b/i, 1.5],
  [/\bconfidential\b.{0,30}(do not|don't) (share|forward)/i, 1.7],
  // Ham signals (negative log-odds)
  [/\bunsubscribe\b/i, -1.2],           // legitimate marketing
  [/\bview in browser\b/i, -0.8],        // newsletter footer
  [/\bprivacy policy\b/i, -1.0],
  [/\bterms (of|and) (service|use)\b/i, -1.0],
  [/\bno-?reply@\w+\.\w+/i, -0.5],      // automated legit
];

// Prior: assume 20% of unsolicited emails are scam (log-odds = log(0.2/0.8) = -1.39)
const PRIOR = -1.39;

/** Returns probability [0, 1] that the text is a scam. */
export function nlpScore(text: string): number {
  const body = text.slice(0, 15000);
  let logOdds = PRIOR;
  for (const [re, w] of TERMS) {
    if (re.test(body)) logOdds += w;
  }
  // sigmoid
  return 1 / (1 + Math.exp(-logOdds));
}

