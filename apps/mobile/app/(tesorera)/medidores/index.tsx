import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../../lib/supabase";
import type { Medidor, Suscriptor } from "@acueducto/types";

type MedidorConSuscriptor = Medidor & { suscriptor: Suscriptor | null };

export default function MedidoresListScreen() {
  const [medidores, setMedidores] = useState<MedidorConSuscriptor[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // RLS filtra por org. Se trae el suscriptor para mostrar a quién pertenece.
    const { data } = await supabase
      .from("medidores")
      .select("*, suscriptor:suscriptores(*)")
      .order("numero_serie", { ascending: true });
    setMedidores((data ?? []) as MedidorConSuscriptor[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? medidores.filter(
        (m) =>
          m.numero_serie.toLowerCase().includes(q) ||
          (m.suscriptor?.apellido ?? "").toLowerCase().includes(q) ||
          (m.suscriptor?.nombre ?? "").toLowerCase().includes(q)
      )
    : medidores;

  function renderItem({ item }: { item: MedidorConSuscriptor }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(tesorera)/medidores/${item.id}`)}
      >
        <View style={styles.cardRow}>
          <Text style={styles.serie}>#{item.numero_serie}</Text>
          {!item.activo && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveText}>Inactivo</Text>
            </View>
          )}
        </View>
        <Text style={styles.sub}>
          {item.suscriptor
            ? `${item.suscriptor.apellido}, ${item.suscriptor.nombre}`
            : "Sin suscriptor"}
          {item.sector ? `  ·  ${item.sector}` : ""}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.search}
          placeholder="Buscar por serie o suscriptor..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#999"
        />
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push("/(tesorera)/medidores/nuevo")}
        >
          <Text style={styles.newBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#1a73e8" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {medidores.length === 0
              ? "Sin medidores todavía."
              : "Sin resultados para tu búsqueda."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: { flexDirection: "row", gap: 10, padding: 16, alignItems: "center" },
  search: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#333",
  },
  newBtn: { backgroundColor: "#1a73e8", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  newBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  serie: { fontSize: 15, fontWeight: "600", color: "#333" },
  sub: { fontSize: 13, color: "#888", marginTop: 4 },
  inactiveBadge: { backgroundColor: "#fee2e2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  inactiveText: { fontSize: 11, color: "#b91c1c", fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { color: "#999", fontSize: 15, textAlign: "center" },
});
