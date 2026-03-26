import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { getMedidores } from "../../lib/database";

export default function MedidoresScreen() {
  const [medidores, setMedidores] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  function loadMedidores() {
    const data = getMedidores();
    setMedidores(data);
    setFiltered(data);
  }

  useEffect(() => {
    loadMedidores();
  }, []);

  useEffect(() => {
    if (!search) {
      setFiltered(medidores);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      medidores.filter(
        (m) =>
          m.numero_serie.toLowerCase().includes(q) ||
          m.suscriptor_apellido.toLowerCase().includes(q) ||
          m.suscriptor_nombre.toLowerCase().includes(q)
      )
    );
  }, [search, medidores]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMedidores();
    setRefreshing(false);
  }, []);

  function renderItem({ item }: { item: any }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(app)/lectura/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.serial}>#{item.numero_serie}</Text>
          {item.sector && <Text style={styles.sector}>{item.sector}</Text>}
        </View>
        <Text style={styles.name}>
          {item.suscriptor_apellido}, {item.suscriptor_nombre}
        </Text>
        <Text style={styles.address}>{item.suscriptor_direccion}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Buscar por nombre o número..."
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#999"
      />
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {medidores.length === 0
              ? "Sin medidores. Conectate a internet para sincronizar."
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
  search: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    margin: 16,
    fontSize: 15,
    color: "#333",
  },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  serial: { fontWeight: "700", fontSize: 15, color: "#1a73e8" },
  sector: { fontSize: 12, color: "#fff", backgroundColor: "#1a73e8", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  name: { fontSize: 15, fontWeight: "600", color: "#333" },
  address: { fontSize: 13, color: "#666", marginTop: 2 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { textAlign: "center", color: "#999", fontSize: 15 },
});
