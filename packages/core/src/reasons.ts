import type { Lang, ReasonKey } from "./types";

/** Engine finding → the ONE sentence a student sees. No jargon, ever. */
export const REASONS: Record<ReasonKey, Record<Lang, string>> = {
  auth_fail: {
    en: "This email failed to verify as coming from the real sender.",
    hi: "यह ईमेल असली भेजने वाले से आया है, इसकी पुष्टि नहीं हो पाई।",
  },
  domain_new: {
    en: "This website/domain was created only a few days ago.",
    hi: "यह वेबसाइट/डोमेन कुछ ही दिन पहले बनाया गया है।",
  },
  college: {
    en: "Sender domain doesn't match official college domain.",
    hi: "भेजने वाले का डोमेन कॉलेज के आधिकारिक डोमेन से मेल नहीं खाता।",
  },
  authority: {
    en: "This email claims to be from a senior person but isn't from an official address.",
    hi: "यह ईमेल किसी वरिष्ठ व्यक्ति का होने का दावा करता है, पर आधिकारिक पते से नहीं आया है।",
  },
  brand: {
    en: "This sender claims to be a trusted brand but isn't using its official domain.",
    hi: "यह भेजने वाला किसी भरोसेमंद ब्रांड का होने का दावा करता है, पर उसके आधिकारिक डोमेन का उपयोग नहीं कर रहा।",
  },
  lookalike: {
    en: "This domain looks similar to a trusted brand but isn't the real one.",
    hi: "यह डोमेन किसी भरोसेमंद ब्रांड जैसा दिखता है, पर असली नहीं है।",
  },
  first_time: {
    en: "This sender is new and hasn't emailed you before.",
    hi: "यह भेजने वाला नया है और इसने पहले आपको ईमेल नहीं किया।",
  },
  reply_to: {
    en: "Replies to this email would go to a different address.",
    hi: "इस ईमेल का जवाब किसी दूसरे पते पर जाएगा।",
  },
  reported: {
    en: "This sender has been reported for scams.",
    hi: "इस भेजने वाले की स्कैम के लिए शिकायत की गई है।",
  },
  subject_pressure: {
    en: "The subject uses urgent or payment wording common in scams.",
    hi: "विषय में जल्दबाज़ी या भुगतान वाली भाषा है, जो स्कैम में आम है।",
  },
  freemail_authority: {
    en: "This email claims an official role but comes from a free email address.",
    hi: "यह ईमेल आधिकारिक पद का दावा करता है, पर मुफ़्त ईमेल पते से आया है।",
  },
  unusual_tld: {
    en: "This sender uses an unusual web address.",
    hi: "यह भेजने वाला एक असामान्य वेब पते का उपयोग कर रहा है।",
  },
  spoofed_trusted: {
    en: "This email pretends to be from a trusted sender but failed verification.",
    hi: "यह ईमेल भरोसेमंद भेजने वाले का नाम इस्तेमाल करता है, पर जाँच में विफल रहा।",
  },
  blocked: { en: "You blocked this sender.", hi: "आपने इस भेजने वाले को ब्लॉक किया है।" },
  allowed: { en: "You marked this sender as safe.", hi: "आपने इस भेजने वाले को सुरक्षित चिह्नित किया है।" },
  safe_verified: {
    en: "Sender verified and matches expected domain.",
    hi: "भेजने वाले की पुष्टि हुई और डोमेन अपेक्षित डोमेन से मेल खाता है।",
  },
  safe_generic: { en: "No red flags found.", hi: "कोई ख़तरे का संकेत नहीं मिला।" },
  generic_caution: {
    en: "Some details of this email look unusual — verify before acting.",
    hi: "इस ईमेल की कुछ बातें असामान्य हैं — कार्रवाई से पहले जाँच लें।",
  },
  scam_offer: {
    en: "This looks like a fake internship/course offer asking for payment.",
    hi: "यह भुगतान माँगने वाला नकली इंटर्नशिप/कोर्स ऑफ़र लगता है।",
  },
  link_mismatch: {
    en: "A link in this email goes somewhere different from what it says.",
    hi: "इस ईमेल का एक लिंक जो दिखता है उससे अलग जगह ले जाता है।",
  },
  payment_request: {
    en: "This email asks you to pay a personal account — official bodies don't do that.",
    hi: "यह ईमेल किसी निजी खाते में भुगतान माँगता है — आधिकारिक संस्थाएँ ऐसा नहीं करतीं।",
  },
  credential_request: {
    en: "This email asks for passwords, OTPs or card details.",
    hi: "यह ईमेल पासवर्ड, OTP या कार्ड की जानकारी माँगता है।",
  },
};

export const getReason = (key: ReasonKey, lang: Lang = "en"): string => REASONS[key][lang] ?? REASONS[key].en;
