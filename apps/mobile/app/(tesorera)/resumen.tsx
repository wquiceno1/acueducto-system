import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { calcularCobro, formatCOP } from "@acueducto/cobros";
import type { Lectura, Medidor, Suscriptor, Tarifa } from "@acueducto/types";

type LecturaConDetalle = Lectura & {
  medidor: Medidor & { suscriptor: Suscriptor };
};

type ResumenSuscriptor = {
  suscriptor_id: string;
  nombre: string;
  apellido: string;
  medidores: {
    numero_serie: string;
    consumo: number;
    cargoFijo: number;
    excedente: number;
    total: number;
    lectura_anterior: number;
    lectura_actual: number;
  }[];
  totalMes: number;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function ResumenScreen() {
  const [lecturas, setLecturas] = useState<LecturaConDetalle[]>([]);
  const [medidoresSinLectura, setMedidoresSinLectura] = useState<
    (Medidor & { suscriptor: Suscriptor })[]
  >([]);
  const [tarifa, setTarifa] = useState<Tarifa | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Mes seleccionado como índices (año, mes 0-11).
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
    setLoading(true);
    loadData().finally(() => setLoading(false));
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

  // Agrupar por suscriptor y calcular cobros (solo si hay tarifa cargada).
  const mapaS = new Map<string, ResumenSuscriptor>();
  if (tarifa) {
    for (const l of lecturas) {
      const sid = l.medidor.suscriptor_id;
      if (!mapaS.has(sid)) {
        mapaS.set(sid, {
          suscriptor_id: sid,
          nombre: l.medidor.suscriptor.nombre,
          apellido: l.medidor.suscriptor.apellido,
          medidores: [],
          totalMes: 0,
        });
      }
      const cobro = calcularCobro(l.consumo, tarifa);
      const entry = mapaS.get(sid)!;
      entry.medidores.push({
        numero_serie: l.medidor.numero_serie,
        consumo: l.consumo,
        lectura_anterior: l.lectura_anterior,
        lectura_actual: l.lectura_actual,
        ...cobro,
      });
      entry.totalMes += cobro.total;
    }
  }

  const resumen: ResumenSuscriptor[] = [];
  mapaS.forEach((v) => resumen.push(v));
  resumen.sort((a, b) => a.apellido.localeCompare(b.apellido));

  const totalRecaudo = resumen.reduce((s, r) => s + r.totalMes, 0);

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

      {/* Lista por suscriptor */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#1a73e8" />
      ) : resumen.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No hay lecturas registradas para este período.
          </Text>
        </View>
      ) : (
        resumen.map((r) => (
          <View key={r.suscriptor_id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>
                {r.apellido}, {r.nombre}
              </Text>
            </View>
            {r.medidores.map((m) => (
              <View key={m.numero_serie} style={styles.medidorRow}>
                <Text style={styles.medidorSerie}>Medidor #{m.numero_serie}</Text>
                <View style={styles.gridRow}>
                  <Text style={styles.gridLabel}>Consumo</Text>
                  <Text style={styles.gridValue}>{m.consumo} m³</Text>
                </View>
                <View style={styles.gridRow}>
                  <Text style={styles.gridLabel}>Cargo fijo</Text>
                  <Text style={styles.gridValue}>{formatCOP(m.cargoFijo)}</Text>
                </View>
                <View style={styles.gridRow}>
                  <Text style={styles.gridLabel}>Excedente</Text>
                  <Text style={styles.gridValue}>{formatCOP(m.excedente)}</Text>
                </View>
                <View style={[styles.gridRow, styles.medidorTotal]}>
                  <Text style={styles.totalLabel}>Total medidor</Text>
                  <Text style={styles.totalValue}>{formatCOP(m.total)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.cardFooter}>
              <Text style={styles.footerLabel}>Total del mes</Text>
              <Text style={styles.footerValue}>{formatCOP(r.totalMes)}</Text>
            </View>
          </View>
        ))
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
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    overflow: "hidden",
  },
  cardHeader: { backgroundColor: "#f9fafb", padding: 14, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  cardName: { fontSize: 15, fontWeight: "600", color: "#333" },
  medidorRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  medidorSerie: { fontSize: 12, fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: 8 },
  gridRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  gridLabel: { fontSize: 14, color: "#888" },
  gridValue: { fontSize: 14, color: "#444" },
  medidorTotal: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  totalLabel: { fontSize: 14, fontWeight: "600", color: "#555" },
  totalValue: { fontSize: 14, fontWeight: "700", color: "#1a73e8" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    padding: 14,
  },
  footerLabel: { fontSize: 14, fontWeight: "600", color: "#1d4ed8" },
  footerValue: { fontSize: 18, fontWeight: "bold", color: "#1d4ed8" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "#999", fontSize: 15, textAlign: "center" },
});
