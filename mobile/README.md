# MailTrace AI — Mobile App

Expo (React Native) app for Gmail header scanning and sender risk analysis.

## Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- A Google Cloud project with **Gmail API** enabled

## Setup

1. **Install dependencies**
   ```bash
   cd mobile
   npm install
   ```

2. **Create Google OAuth Client**
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
   - Create an **OAuth 2.0 Client ID** → Application type: **Android / iOS**
   - For Expo Go use type **Web** (for development) or your bundle ID for production
   - Authorized redirect URIs: `mailtrace://` (your app scheme)

3. **Set your Client ID**
   Replace `YOUR_GOOGLE_CLIENT_ID` in:
   - `app/index.tsx` (line 8)
   - `app/detail.tsx` (line 13)

4. **Run the app**
   ```bash
   npx expo start
   ```
   Scan the QR with the [Expo Go](https://expo.dev/client) app.

## Architecture

| File | Role |
|---|---|
| `lib/engine.ts` | Standalone risk engine — auth parsing, scoring, body analysis |
| `lib/gmail.ts` | Gmail API calls (headers-only by default) |
| `app/index.tsx` | Connect screen — Google OAuth |
| `app/inbox.tsx` | Inbox list — polls every 2 min, shows risk signals |
| `app/detail.tsx` | Email report + deep analysis (explicit consent per email) |

## Privacy
- Email bodies are **never** uploaded. Deep analysis runs entirely on-device.
- OAuth tokens stored in `expo-secure-store` (hardware-backed keystore on Android, Keychain on iOS).
