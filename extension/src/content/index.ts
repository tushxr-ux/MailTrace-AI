import { chromeApi } from "../shared/chromeApi";
import { startDecorator } from "./decorator";
import { gmailAdapter } from "./gmailDom";

// Runs only on mail.google.com. Draws badges + banners from verdicts the service worker already computed.
// This script never reads email content — it only reads sender/subject text Gmail has already rendered.
if (location.hostname === "mail.google.com") startDecorator(gmailAdapter, chromeApi);
