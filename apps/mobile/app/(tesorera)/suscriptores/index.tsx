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
import type { Suscriptor } from "@acueducto/types";

export default function SuscriptoresListScreen() {
  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [search, setSearch] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // RLS filtra por org del usuario: solo trae los de su comunidad.
    const { data } = await supabase
      .from("suscriptores")
      .select("*")
      .order("apellido", { ascending: true });
    setSuscriptores((data ?? []) as Suscriptor[]);
  }, []);

  // Recargar cada vez que la pantalla vuelve a foco (p. ej. tras crear/editar).
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

  // Por defecto solo activos; el toggle suma los inactivos.
  const base = mostrarInactivos ? suscriptores : suscriptores.filter((s) => s.activo);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? base.filter(
        (s) =>
          s.nombre.toLowerCase().includes(q) ||
          s.apellido.toLowerCase().includes(q) ||
          (s.direccion ?? "").toLowerCase().includes(q)
      )
    : base;

  const inactivosCount = suscriptores.filter((s) => !s.activo).length;

  function renderItem({ item }: { item: Suscriptor }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(tesorera)/suscriptores/${item.id}`)}
      >
        <View style={styles.cardRow}>
          <Text style={styles.name}>
            {item.apellido}, {item.nombre}
          </Text>
          {!item.activo && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveText}>Inactivo</Text>
            </View>
          )}
        </View>
        <Text style={styles.direccion}>{item.direccion}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.search}
          placeholder="Buscar..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#999"
        />
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push("/(tesorera)/suscriptores/nuevo")}
        >
          <Text style={styles.newBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {inactivosCount > 0 && (
        <TouchableOpacity
          style={styles.filterToggle}
          onPress={() => setMostrarInactivos((v) => !v)}
        >
          <Text style={styles.filterText}>
            {mostrarInactivos
              ? "✓ Mostrando inactivos"
              : `Ver inactivos (${inactivosCount})`}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#1a73e8" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {suscriptores.length === 0
              ? "Sin suscriptores todavía."
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
  header: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8, alignItems: "center" },
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
  filterToggle: { paddingHorizontal: 16, paddingBottom: 8, alignSelf: "flex-start" },
  filterText: { fontSize: 13, color: "#1a73e8", fontWeight: "500" },
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
  name: { fontSize: 15, fontWeight: "600", color: "#333", flex: 1 },
  direccion: { fontSize: 13, color: "#888", marginTop: 4 },
  inactiveBadge: { backgroundColor: "#fee2e2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  inactiveText: { fontSize: 11, color: "#b91c1c", fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { color: "#999", fontSize: 15, textAlign: "center" },
});
