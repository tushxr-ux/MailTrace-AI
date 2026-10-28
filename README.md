# MailTrace AI — Smarter Email. Safer You.

Privacy-first email threat shield for Gmail (Chrome extension), Outlook (add-in) and mobile.
Full product spec: [`docs/MAILTRACE_AI_BUILD_SPEC.md`](docs/MAILTRACE_AI_BUILD_SPEC.md)

## Build status

| Part | Status | Verified how |
|---|---|---|
| `packages/core` — header/auth parser, look-alike detector, 20-rule engine, scoring, EN/HI reasons, deep-layer body analysis | **Done** | 35 unit tests (spec §14.2 matrix) + strict typecheck |
| `backend` — FastAPI lookups (RDAP, VirusTotal, AbuseIPDB, GeoLite2), cache, rate-limit fallback, whitelist | **Done** | 13 tests with mocked providers |
| `extension` — MV3 service worker, Gmail metadata scanner, block/unblock, one-time deep read, in-Gmail badges + banner, side panel, onboarding, permission log | **Built** | Typecheck + build + browser tests of the UI on the **test-drive page** |
| Extension against **real Gmail** | **Needs your first run** | Requires your Google OAuth client (below). Gmail's DOM selectors (`content/gmailDom.ts`) are unverified on a live inbox. |
| On-device NLP model (`ml/`) | Not started | Deep layer currently uses rule-based phrase/UPI/link analysis; the model hook is `nlpProbability` in `analyzeBody` |
| Outlook add-in, mobile app | Not started | Same `packages/core` will be reused |

## Quick start

```bash
npm install
npm test                      # core engine tests
npm run build:ext             # → extension/dist
cd backend && pip install -r requirements.txt && cp .env.example .env
python -m pytest -q           # backend tests
uvicorn app.main:app --port 8000
```

**Try it with no Google account:** open `extension/dist/testdrive.html` (or `python3 -m http.server -d extension/dist 8765`).
It's a fake inbox running the real engine on 7 sample emails, including the two-layer internship-scam demo (open "Internship offer letter" → View report).

## Load the extension in Chrome (real Gmail)

1. **Google Cloud Console** → new project → enable **Gmail API**.
2. **OAuth consent screen**: External, *Testing* mode, add your Gmail as a test user, add scopes
   `gmail.metadata`, `gmail.labels`, `gmail.settings.basic`. (Testing mode needs no Google verification — fine for SIH.)
3. Build once and load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`. Copy the **extension ID**.
4. **Credentials → Create OAuth client ID → type "Chrome extension"**, paste the extension ID. Copy the client ID.
5. Rebuild with it: `OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com BACKEND_URL=http://localhost:8000 npm run build:ext`, then reload the extension.
   - The extension ID changes if the folder moves. To pin it, generate a key and pass `EXTENSION_KEY=<base64 public key>` at build.
6. Click the toolbar icon → **Connect Gmail**.

**One-time "View report" permission (optional, recommended):** create a second OAuth client of type **Web application** with redirect URI
`https://<extension-id>.chromiumapp.org/`, scope `gmail.readonly`, and build with `OAUTH_WEB_CLIENT_ID=...`.
Without it the extension falls back to a scoped `getAuthToken`, which works but is less "one-time".

## Privacy rules enforced in code
- Default scopes: `gmail.metadata`, `gmail.labels`, `gmail.settings.basic` — **never** `gmail.modify`.
- Scanning calls `messages.get` with `format=metadata` and an explicit header allow-list (`background/gmail.ts`).
- Backend only accepts a bare domain or public IP; an email, URL or private IP returns 422 (tested).
- Body exists only inside `requestReport()`; it is analysed, then dropped. The token is discarded afterwards. Every read is written to the local permission log.

## Known limits (be upfront with judges)
- A token revoked via Google's endpoint may revoke the whole grant on some flows; verify the one-time-read behaviour on your account before the demo.
- Block rules apply to **future** mail (filters); moving existing mail would need `gmail.modify`, which we deliberately avoid.
- `chrome.identity.getAuthToken` only works in Google Chrome (not Brave/Edge).
- VirusTotal free tier is 4 req/min — `backend/data/demo_cache.json` pre-caches the demo domains.

## Next
Prompt 8 (on-device classifier) → Prompt 9 (Outlook add-in) → Prompt 10 (mobile + demo `.eml` kit). See spec §15.
