import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { saldoSuscriptor, estaAlDia, formatCOP } from "@acueducto/cobros";
import type { Suscriptor, Cargo, Pago } from "@acueducto/types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type Fila = { suscriptor: Suscriptor; saldo: number };

export default function CobranzaScreen() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [soloMorosos, setSoloMorosos] = useState(false);

  // Modal "generar cargos"
  const now = new Date();
  const [genVisible, setGenVisible] = useState(false);
  const [genMes, setGenMes] = useState(now.getMonth());
  const [genAnio, setGenAnio] = useState(now.getFullYear());
  const [generando, setGenerando] = useState(false);

  const load = useCallback(async () => {
    // Datos chicos por comunidad: se traen los tres y se calcula el saldo en cliente.
    // Se traen TODOS (incluidos inactivos): un suscriptor dado de baja que aún debe
    // NO debe desaparecer de la cobranza. El filtrado se hace abajo por saldo.
    const [{ data: sus }, { data: cargos }, { data: pagos }] = await Promise.all([
      supabase.from("suscriptores").select("*").order("apellido"),
      supabase.from("cargos").select("suscriptor_id, monto"),
      supabase.from("pagos").select("suscriptor_id, monto"),
    ]);

    const cargosPorSus = new Map<string, Pick<Cargo, "monto">[]>();
    for (const c of (cargos ?? []) as Cargo[]) {
      const arr = cargosPorSus.get(c.suscriptor_id) ?? [];
      arr.push(c);
      cargosPorSus.set(c.suscriptor_id, arr);
    }
    const pagosPorSus = new Map<string, Pick<Pago, "monto">[]>();
    for (const p of (pagos ?? []) as Pago[]) {
      const arr = pagosPorSus.get(p.suscriptor_id) ?? [];
      arr.push(p);
      pagosPorSus.set(p.suscriptor_id, arr);
    }

    const calculadas: Fila[] = ((sus ?? []) as Suscriptor[]).map((s) => ({
      suscriptor: s,
      saldo: saldoSuscriptor(cargosPorSus.get(s.id) ?? [], pagosPorSus.get(s.id) ?? []),
    }));
    setFilas(calculadas);
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

  // Activos siempre; inactivos solo si todavía deben (para no esconder morosos de baja).
  const relevantes = filas.filter((f) => f.suscriptor.activo || f.saldo > 0);
  const visibles = soloMorosos ? relevantes.filter((f) => f.saldo > 0) : relevantes;
  const totalAdeudado = filas.reduce((s, f) => s + Math.max(0, f.saldo), 0);
  const morososCount = filas.filter((f) => f.saldo > 0).length;

  function cambiarMes(delta: number) {
    let m = genMes + delta;
    let a = genAnio;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setGenMes(m);
    setGenAnio(a);
  }

  async function generarCargos() {
    setGenerando(true);
    const periodo = `${genAnio}-${String(genMes + 1).padStart(2, "0")}-01`;
    const { data, error } = await supabase.rpc("generar_cargos_mes", { p_periodo: periodo });
    setGenerando(false);
    setGenVisible(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    Alert.alert(
      "Cargos generados",
      `Se generaron/actualizaron ${data ?? 0} cargos para ${MESES[genMes]} ${genAnio}.`
    );
    setLoading(true);
    load().finally(() => setLoading(false));
  }

  function renderItem({ item }: { item: Fila }) {
    const alDia = estaAlDia(item.saldo);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(tesorera)/cobranza/${item.suscriptor.id}`)}
      >
        <View style={styles.cardRow}>
          <View style={styles.nameWrap}>
            <Text style={styles.name}>
              {item.suscriptor.apellido}, {item.suscriptor.nombre}
            </Text>
            {!item.suscriptor.activo && <Text style={styles.inactivo}>Inactivo</Text>}
          </View>
          <Text style={[styles.saldo, { color: alDia ? "#16a34a" : "#dc2626" }]}>
            {alDia ? "Al día" : formatCOP(item.saldo)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Resumen + acciones */}
      <View style={styles.topCard}>
        <View>
          <Text style={styles.topLabel}>Total adeudado</Text>
          <Text style={styles.topValue}>{formatCOP(totalAdeudado)}</Text>
          <Text style={styles.topSub}>
            {morososCount} {morososCount === 1 ? "moroso" : "morosos"}
          </Text>
        </View>
        <TouchableOpacity style={styles.genBtn} onPress={() => setGenVisible(true)}>
          <Text style={styles.genBtnText}>Generar cargos</Text>
        </TouchableOpacity>
      </View>

      {morososCount > 0 && (
        <TouchableOpacity
          style={styles.filterToggle}
          onPress={() => setSoloMorosos((v) => !v)}
        >
          <Text style={styles.filterText}>
            {soloMorosos ? "✓ Mostrando solo morosos" : "Ver solo morosos"}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#1a73e8" />
      ) : visibles.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {filas.length === 0
              ? "Sin suscriptores. Generá los cargos del mes para empezar."
              : "Nadie debe nada. ¡Todo al día!"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(item) => item.suscriptor.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Modal generar cargos */}
      <Modal visible={genVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Generar cargos del mes</Text>
            <Text style={styles.modalHint}>
              Congela lo que debe cada suscriptor según las lecturas del mes y la tarifa
              vigente de ese período. Se puede regenerar sin duplicar.
            </Text>

            <View style={styles.monthSelector}>
              <TouchableOpacity onPress={() => cambiarMes(-1)} style={styles.monthBtn}>
                <Text style={styles.monthBtnText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {MESES[genMes]} {genAnio}
              </Text>
              <TouchableOpacity onPress={() => cambiarMes(1)} style={styles.monthBtn}>
                <Text style={styles.monthBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setGenVisible(false)}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, generando && styles.disabled]}
                onPress={generarCargos}
                disabled={generando}
              >
                <Text style={styles.modalConfirmText}>
                  {generando ? "Generando..." : "Generar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  topCard: {
    backgroundColor: "#fff",
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topLabel: { fontSize: 13, color: "#888" },
  topValue: { fontSize: 26, fontWeight: "bold", color: "#dc2626", marginTop: 2 },
  topSub: { fontSize: 12, color: "#999", marginTop: 2 },
  genBtn: { backgroundColor: "#1a73e8", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  genBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
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
  nameWrap: { flex: 1, marginRight: 8 },
  name: { fontSize: 15, fontWeight: "600", color: "#333" },
  inactivo: { fontSize: 11, color: "#b91c1c", fontWeight: "600", marginTop: 2 },
  saldo: { fontSize: 15, fontWeight: "700" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { color: "#999", fontSize: 15, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#333", marginBottom: 6 },
  modalHint: { fontSize: 13, color: "#888", marginBottom: 16 },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 20,
  },
  monthBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  monthBtnText: { fontSize: 24, color: "#1a73e8", fontWeight: "600" },
  monthLabel: { fontSize: 16, fontWeight: "600", color: "#333" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 20 },
  modalCancel: { fontSize: 15, color: "#888", fontWeight: "500" },
  modalConfirm: { backgroundColor: "#1a73e8", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  modalConfirmText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  disabled: { opacity: 0.6 },
});
