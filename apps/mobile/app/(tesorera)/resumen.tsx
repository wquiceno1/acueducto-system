import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { calcularCobro, formatCOP } from "@acueducto/cobros";
import type { Lectura, Medidor, Suscriptor, Tarifa } from "@acueducto/types";

type LecturaConDetalle = Lectura & {
  medidor: Medidor & { suscriptor: Suscriptor };
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Panel de métricas generales del mes. El detalle de consumo por suscriptor vive
// en Cobranza (al entrar a cada suscriptor), no acá.
export default function ResumenScreen() {
  const [lecturas, setLecturas] = useState<LecturaConDetalle[]>([]);
  const [medidoresSinLectura, setMedidoresSinLectura] = useState<
    (Medidor & { suscriptor: Suscriptor })[]
  >([]);
  const [tarifa, setTarifa] = useState<Tarifa | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth());

  const loadData = useCallback(async () => {
    const desde = `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
    const hasta = new Date(anio, mes + 1, 0).toISOString().split("T")[0];

    const { data: lecturasData } = await supabase
      .from("lecturas")
      .select("*, medidor:medidores(*, suscriptor:suscriptores(*))")
      .gte("fecha_lectura", desde)
      .lte("fecha_lectura", hasta)
      .order("fecha_lectura", { ascending: false });

    const { data: todosMedidores } = await supabase
      .from("medidores")
      .select("*, suscriptor:suscriptores(*)")
      .eq("activo", true);

    const { data: tarifaData } = await supabase
      .from("tarifas")
      .select("*")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTarifa((tarifaData as Tarifa | null) ?? null);

    const lecturasArr = (lecturasData ?? []) as LecturaConDetalle[];
    setLecturas(lecturasArr);

    const medidoresConLectura = new Set(lecturasArr.map((l) => l.medidor_id));
    const sinLectura = (
      (todosMedidores ?? []) as (Medidor & { suscriptor: Suscriptor })[]
    ).filter((m) => !medidoresConLectura.has(m.id));
    setMedidoresSinLectura(sinLectura);
  }, [anio, mes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [loadData]);

  function cambiarMes(delta: number) {
    let m = mes + delta;
    let a = anio;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setMes(m);
    setAnio(a);
  }

  // Recaudo estimado del mes = suma de los cobros de todas las lecturas.
  const totalRecaudo = tarifa
    ? lecturas.reduce((s, l) => s + calcularCobro(l.consumo, tarifa).total, 0)
    : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Selector de mes */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => cambiarMes(-1)} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MESES[mes]} {anio}
        </Text>
        <TouchableOpacity onPress={() => cambiarMes(1)} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Tarjetas resumen */}
      <View style={styles.cardsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Lecturas</Text>
          <Text style={styles.statValue}>{lecturas.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sin lectura</Text>
          <Text
            style={[
              styles.statValue,
              { color: medidoresSinLectura.length > 0 ? "#ef4444" : "#22c55e" },
            ]}
          >
            {medidoresSinLectura.length}
          </Text>
        </View>
      </View>
      <View style={styles.recaudoCard}>
        <Text style={styles.statLabel}>Recaudo estimado</Text>
        <Text style={styles.recaudoValue}>{formatCOP(totalRecaudo)}</Text>
      </View>

      {/* Alerta medidores sin lectura */}
      {medidoresSinLectura.length > 0 && (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>
            {medidoresSinLectura.length} medidor(es) sin lectura este mes:
          </Text>
          {medidoresSinLectura.map((m) => (
            <Text key={m.id} style={styles.alertItem}>
              #{m.numero_serie} — {m.suscriptor.apellido}, {m.suscriptor.nombre}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16 },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#eee",
  },
  monthBtn: { paddingHorizontal: 16, paddingVertical: 6 },
  monthBtnText: { fontSize: 24, color: "#1a73e8", fontWeight: "600" },
  monthLabel: { fontSize: 16, fontWeight: "600", color: "#333" },
  cardsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  statLabel: { fontSize: 13, color: "#888" },
  statValue: { fontSize: 28, fontWeight: "bold", color: "#333", marginTop: 4 },
  recaudoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  recaudoValue: { fontSize: 28, fontWeight: "bold", color: "#1a73e8", marginTop: 4 },
  alert: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  alertTitle: { fontWeight: "600", color: "#b91c1c", marginBottom: 6 },
  alertItem: { fontSize: 13, color: "#dc2626", marginTop: 2 },
});
