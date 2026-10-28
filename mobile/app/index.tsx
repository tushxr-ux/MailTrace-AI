import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";

// Scopes for header-only scanning (no message body)
const META_SCOPES = [
  "https://www.googleapis.com/auth/gmail.metadata",
  "openid",
  "email",
  "profile",
];

export default function ConnectScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const discovery = AuthSession.useAutoDiscovery("https://accounts.google.com");
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "mailtrace" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri,
      scopes: META_SCOPES,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { access_type: "offline" },
    },
    discovery
  );

  // Check if already authenticated
  useEffect(() => {
    SecureStore.getItemAsync("access_token").then((token) => {
      if (token) router.replace("/inbox");
      else setLoading(false);
    });
  }, []);

  // Handle OAuth response
  useEffect(() => {
    if (!response || response.type !== "success") {
      if (response?.type === "error" || response?.type === "cancel") setAuthLoading(false);
      return;
    }
    const { code } = response.params;
    exchangeCode(code);
  }, [response]);

  async function exchangeCode(code: string) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: request!.codeVerifier!,
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        await SecureStore.setItemAsync("access_token", data.access_token);
        if (data.refresh_token) await SecureStore.setItemAsync("refresh_token", data.refresh_token);
        router.replace("/inbox");
      } else {
        console.error("Token exchange failed:", data);
        setAuthLoading(false);
      }
    } catch (e) {
      console.error("Token exchange error:", e);
      setAuthLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoArea}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🛡️</Text>
        </View>
        <Text style={styles.appName}>MailTrace AI</Text>
        <Text style={styles.tagline}>Sender risk analysis — on your device</Text>
      </View>

      <View style={styles.features}>
        {[
          ["🔍", "Scans email headers for spoofing & auth failures"],
          ["⚡", "Real-time alerts for suspicious senders"],
          ["🔒", "Deep analysis stays on-device — nothing leaves your phone"],
        ].map(([icon, text]) => (
          <View key={text} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{icon}</Text>
            <Text style={styles.featureText}>{text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.btn, authLoading && styles.btnDisabled]}
        disabled={!request || authLoading}
        onPress={() => {
          setAuthLoading(true);
          promptAsync();
        }}
      >
        {authLoading ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.btnText}>Connect Gmail</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        Only reads email headers (sender, authentication). Body access requires explicit approval per email.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" },
  container: { flex: 1, backgroundColor: "#0f172a", padding: 28, justifyContent: "center" },
  logoArea: { alignItems: "center", marginBottom: 48 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#1e293b", justifyContent: "center", alignItems: "center",
    marginBottom: 16, borderWidth: 2, borderColor: "#22c55e",
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 28, fontWeight: "bold", color: "#f1f5f9", marginBottom: 8 },
  tagline: { fontSize: 14, color: "#94a3b8", textAlign: "center" },
  features: { marginBottom: 40 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  featureIcon: { fontSize: 20, marginRight: 12, marginTop: 1 },
  featureText: { flex: 1, fontSize: 14, color: "#cbd5e1", lineHeight: 20 },
  btn: {
    backgroundColor: "#22c55e", borderRadius: 12, paddingVertical: 16,
    alignItems: "center", marginBottom: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#0f172a", fontWeight: "bold", fontSize: 16 },
  note: { fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 18 },
});
