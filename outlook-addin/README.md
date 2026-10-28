# MailTrace AI — Outlook Add-in

Scans email headers for phishing signals and shows a risk card in a task pane.
No build step required — plain HTML + JS served from localhost.

## Prerequisites

- Node.js 18+
- `office-addin-dev-server` (or any HTTPS static server on port 3000)

## Quick start

```bash
# From the repo root
npx office-addin-dev-server outlook-addin/taskpane.html --port 3000
```

Alternatively use `npx http-server` with a self-signed cert:

```bash
npx http-server . -p 3000 --ssl --cert ~/.office-addin-dev-certs/localhost.crt --key ~/.office-addin-dev-certs/localhost.key
```

## Sideload into Outlook (Windows)

1. Open Outlook → File → Manage Add-ins → "My add-ins" → Add a custom add-in → From file.
2. Browse to `outlook-addin/manifest.xml` and click OK.
3. Open any email; click **MailTrace AI → Scan Email** in the ribbon.

## Sideload into Outlook on the Web (OWA)

1. Open OWA → gear → Manage add-ins → Upload Custom Add-in → Upload from file.
2. Select `outlook-addin/manifest.xml`.
3. Open any email; the add-in appears in the ribbon.

## How it works

| Step | What happens |
|------|-------------|
| `Office.onReady` | Reads internet headers via `item.internetHeaders.getAsync` (falls back to `item.from` / `item.subject` on older hosts) |
| Header scan | SPF / DKIM / DMARC, reply-to mismatch, display-name brand/authority checks, suspicious TLD, subject pressure — same rule weights as the Chrome extension |
| Risk card | Green / Yellow / Red badge + one-sentence reason |
| Deep Analysis | User clicks button → `item.body.getAsync(Html)` → fee/credential/UPI/link-mismatch patterns |

## Trusted hosts

Authentication-Results headers are only trusted when stamped by `google.com`,
`outlook.com`, `protection.outlook.com`, or `office365.com` — exactly matching
the extension's `auth.ts` logic.
