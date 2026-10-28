import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, StyleSheet, Text,
  TouchableOpacity, View, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { fetchMessageList, fetchMessageMeta } from "../lib/gmail";
import { scoreEmail, type ScoredEmail } from "../lib/engine";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const RISK_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
};

const RISK_LABEL: Record<string, string> = {
  green: "Safe",
  yellow: "Caution",
  red: "Danger",
};

export default function InboxScreen() {
  const router = useRouter();
  const [emails, setEmails] = useState<ScoredEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef(new Set<string>());
  const notifPermRef = useRef(false);

  useEffect(() => {
    Notifications.requestPermissionsAsync().then(({ status }) => {
      notifPermRef.current = status === "granted";
    });

    loadEmails();
    const timer = setInterval(() => loadEmails(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync("access_token");
  }

  async function loadEmails(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { router.replace("/"); return; }

      const ids = await fetchMessageList(token, 20);
      const scored: ScoredEmail[] = [];

      for (const id of ids) {
        const meta = await fetchMessageMeta(token, id);
        if (!meta) continue;
        const result = scoreEmail(meta);
        scored.push(result);

        // Notify on new suspicious/danger emails
        if (!seenIds.current.has(id) && result.level !== "green" && notifPermRef.current) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: result.level === "red" ? "⚠️ Dangerous Email" : "⚡ Suspicious Email",
              body: `From: ${result.from}\n${result.reason}`,
              data: { emailId: id },
            },
            trigger: null,
          });
        }
        seenIds.current.add(id);
      }

      setEmails(scored);
    } catch (e: any) {
      setError(e.message || "Failed to load emails");
      if (e.message?.includes("401")) {
        await SecureStore.deleteItemAsync("access_token");
        router.replace("/");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function renderItem({ item }: { item: ScoredEmail }) {
    const color = RISK_COLORS[item.level];
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push({ pathname: "/detail", params: { emailId: item.id, level: item.level } })}
        activeOpacity={0.7}
      >
        <View style={[styles.riskDot, { backgroundColor: color }]} />
        <View style={styles.itemBody}>
          <Text style={styles.itemFrom} numberOfLines={1}>{item.from}</Text>
          <Text style={styles.itemSubject} numberOfLines={1}>{item.subject}</Text>
          <Text style={[styles.itemReason, { color }]}>{RISK_LABEL[item.level]} · {item.reason}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingText}>Scanning your inbox…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}
      <FlatList
        data={emails}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        contentContainerStyle={emails.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadEmails(true); }}
            tintColor="#22c55e"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyInner}>
            <Text style={styles.emptyEmoji}>✉️</Text>
            <Text style={styles.emptyText}>No emails found</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <TouchableOpacity style={styles.disconnectBtn} onPress={async () => {
        await SecureStore.deleteItemAsync("access_token");
        await SecureStore.deleteItemAsync("refresh_token");
        router.replace("/");
      }}>
        <Text style={styles.disconnectText}>Disconnect Account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" },
  loadingText: { marginTop: 12, color: "#94a3b8", fontSize: 14 },
  container: { flex: 1, backgroundColor: "#0f172a" },
  errorBanner: { backgroundColor: "#7f1d1d", padding: 12 },
  errorText: { color: "#fca5a5", fontSize: 13, textAlign: "center" },
  item: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#1e293b",
  },
  riskDot: { width: 10, height: 10, borderRadius: 5, marginRight: 14, flexShrink: 0 },
  itemBody: { flex: 1 },
  itemFrom: { color: "#f1f5f9", fontWeight: "600", fontSize: 14, marginBottom: 2 },
  itemSubject: { color: "#94a3b8", fontSize: 13, marginBottom: 4 },
  itemReason: { fontSize: 12, fontWeight: "500" },
  chevron: { color: "#475569", fontSize: 20, marginLeft: 8 },
  separator: { height: 1, backgroundColor: "#0f172a" },
  emptyContainer: { flex: 1 },
  emptyInner: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: "#64748b", fontSize: 16 },
  disconnectBtn: { padding: 16, alignItems: "center", borderTopWidth: 1, borderTopColor: "#1e293b" },
  disconnectText: { color: "#475569", fontSize: 13 },
});
