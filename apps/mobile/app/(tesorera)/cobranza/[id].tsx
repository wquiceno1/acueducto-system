import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { DateField } from "../../../components/DateField";
import { toast } from "../../../lib/ui";
import {
  saldoSuscriptor, estaAlDia, calcularCobro, formatCOP,
  construirFactura, construirComprobantePago,
} from "@acueducto/cobros";
import { compartirFacturaPDF, compartirComprobantePagoPDF } from "../../../lib/comprobante";
import type {
  Suscriptor, Cargo, Pago, MetodoPago, Medidor, Lectura, Tarifa,
} from "@acueducto/types";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const METODOS: MetodoPago[] = ["efectivo", "transferencia", "otro"];

type LecturaConMedidor = Lectura & { medidor: Pick<Medidor, "numero_serie"> };

function periodoLabel(p: string) {
  const [y, m] = p.split("-");
  return `${MESES[parseInt(m ?? "1", 10) - 1]} ${y}`;
}
function hoyISO() {
  return new Date().toISOString().split("T")[0];
}
// Último día del mes de un período "AAAA-MM-01" -> "AAAA-MM-31".
function finDeMes(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y ?? 0, m ?? 0, 0).toISOString().split("T")[0];
}

export default function EstadoCuentaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [suscriptor, setSuscriptor] = useState<Suscriptor | null>(null);
  const [orgNombre, setOrgNombre] = useState("");
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitiendo, setEmitiendo] = useState(false);

  // Consumo del mes (detalle por medidor, movido desde Resumen).
  const now = new Date();
  const [mesC, setMesC] = useState(now.getMonth());
  const [anioC, setAnioC] = useState(now.getFullYear());
  const [consumoLecturas, setConsumoLecturas] = useState<LecturaConMedidor[]>([]);
  const [tarifa, setTarifa] = useState<Tarifa | null>(null);

  // Modal registrar pago
  const [pagoVisible, setPagoVisible] = useState(false);
  const [monto, setMonto] = useState("");
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: sus }, { data: cs }, { data: ps }] = await Promise.all([
      supabase
        .from("suscriptores")
        .select("*, organizacion:organizaciones(nombre)")
        .eq("id", id)
        .single(),
      supabase.from("cargos").select("*").eq("suscriptor_id", id).order("periodo", { ascending: false }),
      supabase.from("pagos").select("*").eq("suscriptor_id", id).order("fecha_pago", { ascending: false }),
    ]);
    setSuscriptor((sus as Suscriptor) ?? null);
    setOrgNombre((sus as { organizacion?: { nombre?: string } })?.organizacion?.nombre ?? "");
    setCargos((cs ?? []) as Cargo[]);
    setPagos((ps ?? []) as Pago[]);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  // Detalle de consumo del suscriptor para el mes elegido (independiente del saldo).
  const loadConsumo = useCallback(async () => {
    const desde = `${anioC}-${String(mesC + 1).padStart(2, "0")}-01`;
    const hasta = new Date(anioC, mesC + 1, 0).toISOString().split("T")[0];
    const [{ data: lecs }, { data: tar }] = await Promise.all([
      supabase
        .from("lecturas")
        .select("*, medidor:medidores!inner(numero_serie, suscriptor_id)")
        .eq("medidor.suscriptor_id", id)
        .gte("fecha_lectura", desde)
        .lte("fecha_lectura", hasta),
      // Tarifa que REGÍA en el mes consultado (no la última vigente), igual que el cargo.
      supabase
        .from("tarifas")
        .select("*")
        .lte("vigente_desde", hasta)
        .order("vigente_desde", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setConsumoLecturas((lecs ?? []) as LecturaConMedidor[]);
    setTarifa((tar as Tarifa | null) ?? null);
  }, [id, mesC, anioC]);

  useEffect(() => {
    loadConsumo();
  }, [loadConsumo]);

  const saldo = saldoSuscriptor(cargos, pagos);
  const alDia = estaAlDia(saldo);

  function cambiarMesC(delta: number) {
    let m = mesC + delta;
    let a = anioC;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setMesC(m);
    setAnioC(a);
  }

  const consumoDetalle = tarifa
    ? consumoLecturas.map((l) => ({
        numero_serie: l.medidor.numero_serie,
        consumo: l.consumo,
        ...calcularCobro(l.consumo, tarifa),
      }))
    : [];
  const totalConsumoMes = consumoDetalle.reduce((s, d) => s + d.total, 0);

  function abrirPago() {
    setMonto(saldo > 0 ? String(saldo) : "");
    setFechaPago(hoyISO());
    setMetodo("efectivo");
    setNotas("");
    setPagoVisible(true);
  }

  async function registrarPago() {
    const m = Number(monto);
    if (Number.isNaN(m) || m <= 0) {
      Alert.alert("Monto inválido", "El monto debe ser un número mayor a 0.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("pagos").insert({
      suscriptor_id: id,
      monto: m,
      fecha_pago: fechaPago,
      metodo,
      notas: notas.trim() || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setPagoVisible(false);
    toast("Pago registrado");
    setLoading(true);
    load().finally(() => setLoading(false));
  }

  const nombreSuscriptor = suscriptor
    ? `${suscriptor.apellido}, ${suscriptor.nombre}`
    : "";

  // Factura del mes de un cargo: folio (RPC) -> datos del período (lecturas por medidor +
  // tarifa del PERÍODO) -> ensamblado (Fase 1) -> PDF (Fase 2).
  async function compartirFactura(cargo: Cargo) {
    if (emitiendo) return;
    setEmitiendo(true);
    try {
      const { data: comp, error } = await supabase.rpc("emitir_comprobante", {
        p_tipo: "factura",
        p_referencia_id: cargo.id,
      });
      if (error || !comp) throw new Error(error?.message ?? "No se pudo emitir el comprobante");

      const fin = finDeMes(cargo.periodo);
      const [{ data: lecs }, { data: tar }] = await Promise.all([
        supabase
          .from("lecturas")
          .select("consumo, medidor:medidores!inner(numero_serie, suscriptor_id)")
          .eq("medidor.suscriptor_id", id)
          .gte("fecha_lectura", cargo.periodo)
          .lte("fecha_lectura", fin),
        supabase
          .from("tarifas")
          .select("*")
          .lte("vigente_desde", fin)
          .order("vigente_desde", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!tar) throw new Error("No hay una tarifa para el período del cargo.");

      // Supabase infiere el join `medidor` como array; en runtime es un objeto (to-one).
      const filas = (lecs ?? []) as unknown as {
        consumo: number;
        medidor: { numero_serie: string };
      }[];

      const datos = construirFactura({
        folio: comp.folio,
        organizacion: orgNombre,
        suscriptor: nombreSuscriptor,
        periodo: cargo.periodo,
        lineas: filas.map((l) => ({
          numeroSerie: l.medidor.numero_serie,
          consumo: l.consumo,
        })),
        tarifa: tar as Tarifa,
        totalCongelado: cargo.monto,
        saldoCuenta: saldo,
        emitidoEn: hoyISO(),
      });
      await compartirFacturaPDF(datos);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo generar la factura.");
    } finally {
      setEmitiendo(false);
    }
  }

  // Comprobante de un pago: folio (RPC) -> ensamblado con saldo restante -> PDF.
  async function compartirComprobantePago(pago: Pago) {
    if (emitiendo) return;
    setEmitiendo(true);
    try {
      const { data: comp, error } = await supabase.rpc("emitir_comprobante", {
        p_tipo: "pago",
        p_referencia_id: pago.id,
      });
      if (error || !comp) throw new Error(error?.message ?? "No se pudo emitir el comprobante");

      const datos = construirComprobantePago({
        folio: comp.folio,
        organizacion: orgNombre,
        suscriptor: nombreSuscriptor,
        pago: { monto: pago.monto, fecha_pago: pago.fecha_pago, metodo: pago.metodo },
        cargos,
        pagos,
        emitidoEn: hoyISO(),
      });
      await compartirComprobantePagoPDF(datos);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo generar el comprobante.");
    } finally {
      setEmitiendo(false);
    }
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1a73e8" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Saldo */}
      <View style={styles.saldoCard}>
        <Text style={styles.suscriptorNombre}>
          {suscriptor ? `${suscriptor.apellido}, ${suscriptor.nombre}` : ""}
        </Text>
        <Text style={styles.saldoLabel}>{alDia ? "Saldo a favor / al día" : "Debe"}</Text>
        <Text style={[styles.saldoValor, { color: alDia ? "#16a34a" : "#dc2626" }]}>
          {alDia ? "Al día" : formatCOP(saldo)}
        </Text>
        <TouchableOpacity style={styles.pagoBtn} onPress={abrirPago}>
          <Text style={styles.pagoBtnText}>+ Registrar pago</Text>
        </TouchableOpacity>
      </View>

      {/* Consumo del mes (detalle por medidor) */}
      <Text style={styles.sectionTitle}>Consumo</Text>
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => cambiarMesC(-1)} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MESES_LARGO[mesC]} {anioC}</Text>
        <TouchableOpacity onPress={() => cambiarMesC(1)} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>
      {consumoDetalle.length === 0 ? (
        <Text style={styles.empty}>Sin lecturas registradas este mes.</Text>
      ) : (
        <View style={styles.consumoCard}>
          {consumoDetalle.map((d) => (
            <View key={d.numero_serie} style={styles.medidorRow}>
              <Text style={styles.medidorSerie}>Medidor #{d.numero_serie}</Text>
              <View style={styles.gridRow}>
                <Text style={styles.gridLabel}>Consumo</Text>
                <Text style={styles.gridValue}>{d.consumo} m³</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.gridLabel}>Cargo fijo</Text>
                <Text style={styles.gridValue}>{formatCOP(d.cargoFijo)}</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.gridLabel}>Excedente</Text>
                <Text style={styles.gridValue}>{formatCOP(d.excedente)}</Text>
              </View>
              <View style={[styles.gridRow, styles.medidorTotal]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatCOP(d.total)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.consumoFooter}>
            <Text style={styles.footerLabel}>Total del mes</Text>
            <Text style={styles.footerValue}>{formatCOP(totalConsumoMes)}</Text>
          </View>
        </View>
      )}

      {/* Cargos */}
      <Text style={styles.sectionTitle}>Cargos</Text>
      {cargos.length === 0 ? (
        <Text style={styles.empty}>Sin cargos generados todavía.</Text>
      ) : (
        cargos.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowMain}>{periodoLabel(c.periodo)}</Text>
              {c.consumo_total != null && (
                <Text style={styles.rowSub}>{c.consumo_total} m³</Text>
              )}
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowCargo}>{formatCOP(c.monto)}</Text>
              <TouchableOpacity onPress={() => compartirFactura(c)} disabled={emitiendo}>
                <Text style={styles.compartirLink}>Compartir factura</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Pagos */}
      <Text style={styles.sectionTitle}>Pagos</Text>
      {pagos.length === 0 ? (
        <Text style={styles.empty}>Sin pagos registrados.</Text>
      ) : (
        pagos.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowMain}>{p.fecha_pago}</Text>
              <Text style={styles.rowSub}>
                {p.metodo}
                {p.notas ? ` · ${p.notas}` : ""}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowPago}>− {formatCOP(p.monto)}</Text>
              <TouchableOpacity onPress={() => compartirComprobantePago(p)} disabled={emitiendo}>
                <Text style={styles.compartirLink}>Compartir comprobante</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Modal registrar pago */}
      <Modal visible={pagoVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Registrar pago</Text>

            <Text style={styles.label}>Monto ($)</Text>
            <TextInput
              style={styles.input}
              value={monto}
              onChangeText={setMonto}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#999"
            />

            <DateField label="Fecha del pago" value={fechaPago} onChange={setFechaPago} />

            <Text style={styles.label}>Método</Text>
            <View style={styles.metodos}>
              {METODOS.map((mtd) => (
                <TouchableOpacity
                  key={mtd}
                  style={[styles.metodoChip, metodo === mtd && styles.metodoChipOn]}
                  onPress={() => setMetodo(mtd)}
                >
                  <Text style={[styles.metodoText, metodo === mtd && styles.metodoTextOn]}>
                    {mtd}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Notas (opcional)</Text>
            <TextInput
              style={styles.input}
              value={notas}
              onChangeText={setNotas}
              placeholder="Ej. transferencia Nequi"
              placeholderTextColor="#999"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setPagoVisible(false)}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, saving && styles.disabled]}
                onPress={registrarPago}
                disabled={saving}
              >
                <Text style={styles.modalConfirmText}>{saving ? "Guardando..." : "Guardar pago"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Overlay mientras se genera y comparte el PDF */}
      <Modal visible={emitiendo} transparent animationType="fade">
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Generando PDF…</Text>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16 },
  saldoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    marginBottom: 20,
  },
  suscriptorNombre: { fontSize: 15, fontWeight: "600", color: "#333", marginBottom: 8 },
  saldoLabel: { fontSize: 13, color: "#888" },
  saldoValor: { fontSize: 30, fontWeight: "bold", marginTop: 2, marginBottom: 14 },
  pagoBtn: { backgroundColor: "#1a73e8", borderRadius: 8, padding: 14, alignItems: "center" },
  pagoBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#333", marginBottom: 8, marginTop: 8 },
  empty: { color: "#999", fontSize: 14, marginBottom: 12 },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  monthBtn: { paddingHorizontal: 16, paddingVertical: 6 },
  monthBtnText: { fontSize: 22, color: "#1a73e8", fontWeight: "600" },
  monthLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  consumoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    overflow: "hidden",
    marginBottom: 12,
  },
  medidorRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  medidorSerie: { fontSize: 12, fontWeight: "600", color: "#888", textTransform: "uppercase", marginBottom: 8 },
  gridRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  gridLabel: { fontSize: 14, color: "#888" },
  gridValue: { fontSize: 14, color: "#444" },
  medidorTotal: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  totalLabel: { fontSize: 14, fontWeight: "600", color: "#555" },
  totalValue: { fontSize: 14, fontWeight: "700", color: "#1a73e8" },
  consumoFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    padding: 14,
  },
  footerLabel: { fontSize: 14, fontWeight: "600", color: "#1d4ed8" },
  footerValue: { fontSize: 16, fontWeight: "bold", color: "#1d4ed8" },
  row: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowInfo: { flex: 1 },
  rowRight: { alignItems: "flex-end" },
  rowMain: { fontSize: 14, color: "#333", fontWeight: "500" },
  rowSub: { fontSize: 12, color: "#999", marginTop: 2 },
  rowCargo: { fontSize: 14, fontWeight: "700", color: "#dc2626" },
  rowPago: { fontSize: 14, fontWeight: "700", color: "#16a34a" },
  compartirLink: { fontSize: 12, color: "#1a73e8", fontWeight: "600", marginTop: 4 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: { color: "#fff", fontSize: 15, fontWeight: "600", marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#333", marginBottom: 16 },
  label: { fontSize: 13, color: "#666", marginBottom: 6, fontWeight: "500" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
    marginBottom: 14,
  },
  metodos: { flexDirection: "row", gap: 8, marginBottom: 14 },
  metodoChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  metodoChipOn: { backgroundColor: "#e8f0fe", borderColor: "#1a73e8" },
  metodoText: { fontSize: 13, color: "#666", textTransform: "capitalize" },
  metodoTextOn: { color: "#1a73e8", fontWeight: "600" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 20, marginTop: 4 },
  modalCancel: { fontSize: 15, color: "#888", fontWeight: "500" },
  modalConfirm: { backgroundColor: "#1a73e8", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  modalConfirmText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  disabled: { opacity: 0.6 },
});
