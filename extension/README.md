# MailTrace AI — Chrome extension
See the root README for setup. Layout: `src/background` (service worker: scan, block, deep read), `src/content` (Gmail badges/banner; Gmail selectors only in `gmailDom.ts`), `src/ui` (React side panel + onboarding), `src/testdrive` (fake inbox on the real engine).
Build env vars: `BACKEND_URL`, `CLIENT_TOKEN`, `OAUTH_CLIENT_ID`, `OAUTH_WEB_CLIENT_ID`, `EXTENSION_KEY`. `npm run dev` rebuilds on change.
