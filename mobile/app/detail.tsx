import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fetchMessageBody } from "../lib/gmail";
import { analyzeBody, type DeepReport } from "../lib/engine";

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";

const RISK_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
};

const LEVEL_LABELS: Record<string, string> = {
  green: "Safe",
  yellow: "Caution",
  red: "Danger",
};

const DEEP_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid", "email", "profile",
];

export default function DetailScreen() {
  const router = useRouter();
  const { emailId, level } = useLocalSearchParams<{ emailId: string; level: string }>();
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepReport, setDeepReport] = useState<DeepReport | null>(null);

  const safeLevel = (level ?? "green") as string;
  const color = RISK_COLORS[safeLevel] ?? "#22c55e";

  const discovery = AuthSession.useAutoDiscovery("https://accounts.google.com");
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "mailtrace" });

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri,
      scopes: DEEP_SCOPES,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { access_type: "online", prompt: "consent" },
    },
    discovery
  );

  async function runDeepAnalysis() {
    Alert.alert(
      "Deep Analysis",
      "This will request one-time access to read the body of this email. The content stays on your device and is never uploaded anywhere.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Allow & Analyse",
          onPress: async () => {
            setDeepLoading(true);
            try {
              const resp = await promptAsync();
              if (resp.type !== "success") { setDeepLoading(false); return; }

              // Exchange for a short-lived read token
              const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  code: resp.params.code,
                  client_id: CLIENT_ID,
                  redirect_uri: redirectUri,
                  grant_type: "authorization_code",
                  code_verifier: request!.codeVerifier!,
                }).toString(),
              });
              const tokenData = await tokenRes.json();
              if (!tokenData.access_token) throw new Error("Token exchange failed");

              const body = await fetchMessageBody(tokenData.access_token, emailId);
              const report = analyzeBody(body);
              setDeepReport(report);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Deep analysis failed");
            } finally {
              setDeepLoading(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Risk banner */}
      <View style={[styles.banner, { borderColor: color }]}>
        <Text style={[styles.bannerLevel, { color }]}>{LEVEL_LABELS[safeLevel]}</Text>
        <Text style={styles.bannerSub}>Email ID: {emailId?.slice(0, 16)}…</Text>
      </View>

      {/* Deep analysis section */}
      {!deepReport ? (
        <TouchableOpacity
          style={[styles.deepBtn, deepLoading && styles.btnDisabled]}
          disabled={deepLoading || !request}
          onPress={runDeepAnalysis}
        >
          {deepLoading ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <>
              <Text style={styles.deepBtnIcon}>🔬</Text>
              <Text style={styles.deepBtnText}>Deep Analysis</Text>
              <Text style={styles.deepBtnSub}>Reads email body (one-time consent)</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>Body Analysis Result</Text>
          <View style={[styles.reportBadge, { backgroundColor: deepReport.label === "scam" ? "#ef4444" : deepReport.label === "suspicious" ? "#f59e0b" : "#22c55e" }]}>
            <Text style={styles.reportBadgeText}>{deepReport.label.toUpperCase()}</Text>
          </View>

          {deepReport.hits.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Triggers found</Text>
              {deepReport.hits.map((h) => (
                <View key={h.id} style={styles.hitRow}>
                  <Text style={styles.hitId}>{h.id}</Text>
                  <Text style={styles.hitNote}>{h.note}</Text>
                  <Text style={styles.hitPts}>+{h.points}pt</Text>
                </View>
              ))}
            </>
          )}

          {deepReport.phrases.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Suspicious phrases</Text>
              {deepReport.phrases.map((p, i) => (
                <Text key={i} style={styles.phrase}>"{p}"</Text>
              ))}
            </>
          )}

          {deepReport.upiIds.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>UPI IDs found</Text>
              {deepReport.upiIds.map((u) => (
                <Text key={u} style={styles.upiId}>{u}</Text>
              ))}
            </>
          )}

          {deepReport.hits.length === 0 && (
            <Text style={styles.cleanText}>✓ No suspicious patterns found in body</Text>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back to Inbox</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20, paddingBottom: 40 },
  banner: {
    borderRadius: 12, borderWidth: 2, padding: 20,
    alignItems: "center", marginBottom: 24, backgroundColor: "#1e293b",
  },
  bannerLevel: { fontSize: 32, fontWeight: "bold", marginBottom: 4 },
  bannerSub: { color: "#64748b", fontSize: 12 },
  deepBtn: {
    backgroundColor: "#22c55e", borderRadius: 12, padding: 20,
    alignItems: "center", marginBottom: 24,
  },
  btnDisabled: { opacity: 0.6 },
  deepBtnIcon: { fontSize: 28, marginBottom: 6 },
  deepBtnText: { color: "#0f172a", fontWeight: "bold", fontSize: 18 },
  deepBtnSub: { color: "#166534", fontSize: 12, marginTop: 4 },
  reportCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 24 },
  reportTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  reportBadge: {
    alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 10,
    paddingVertical: 4, marginBottom: 16,
  },
  reportBadgeText: { color: "#0f172a", fontWeight: "bold", fontSize: 12 },
  sectionHeader: { color: "#94a3b8", fontSize: 12, fontWeight: "600", marginTop: 16, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  hitRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8, gap: 8 },
  hitId: { color: "#64748b", fontSize: 11, fontFamily: "monospace", minWidth: 50, marginTop: 1 },
  hitNote: { flex: 1, color: "#cbd5e1", fontSize: 13 },
  hitPts: { color: "#ef4444", fontSize: 12, fontWeight: "600" },
  phrase: { color: "#fbbf24", fontSize: 13, fontStyle: "italic", marginBottom: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "#f59e0b" },
  upiId: { color: "#ef4444", fontSize: 13, fontFamily: "monospace", marginBottom: 4 },
  cleanText: { color: "#22c55e", fontSize: 14, textAlign: "center", marginTop: 8 },
  backBtn: { padding: 16, alignItems: "center" },
  backBtnText: { color: "#64748b", fontSize: 14 },
});
