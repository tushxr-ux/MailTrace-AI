export const CONFIG = {
  backendUrl: __BACKEND_URL__.replace(/\/$/, ""),
  clientToken: __CLIENT_TOKEN__,
  webClientId: __WEB_CLIENT_ID__,
  pollMinutes: 0.75,
  lookupTimeoutMs: 2500,
  maxItems: 200,
  blockedLabel: "MailTrace-Blocked",
  scopes: {
    metadata: "https://www.googleapis.com/auth/gmail.metadata",
    labels: "https://www.googleapis.com/auth/gmail.labels",
    filters: "https://www.googleapis.com/auth/gmail.settings.basic",
    deepRead: "https://www.googleapis.com/auth/gmail.readonly",
  },
} as const;
