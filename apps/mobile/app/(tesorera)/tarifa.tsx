import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { DateField } from "../../components/DateField";
import { formatCOP } from "@acueducto/cobros";
import type { Tarifa } from "@acueducto/types";

function hoyISO() {
  return new Date().toISOString().split("T")[0];
}

// Valida formato AAAA-MM-DD y que sea una fecha real.
function fechaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().split("T")[0] === s;
}

export default function TarifaScreen() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form (se pre-llena con la vigente para ajustar solo lo que cambia).
  const [cargoFijo, setCargoFijo] = useState("");
  const [consumoBase, setConsumoBase] = useState("");
  const [precioExcedente, setPrecioExcedente] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState(hoyISO());

  const vigente = tarifas[0] ?? null;
  const historico = tarifas.slice(1);

  const load = useCallback(async () => {
    // Se traen TODAS: la más reciente es la vigente, el resto es histórico.
    const { data } = await supabase
      .from("tarifas")
      .select("*")
      .order("vigente_desde", { ascending: false });
    const lista = (data ?? []) as Tarifa[];
    setTarifas(lista);
    const v = lista[0];
    if (v) {
      setCargoFijo(String(v.cargo_fijo));
      setConsumoBase(String(v.consumo_base_m3));
      setPrecioExcedente(String(v.precio_excedente_m3));
    }
    setVigenteDesde(hoyISO());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const guardar = useCallback(async () => {
    const cf = Number(cargoFijo);
    const cb = Number(consumoBase);
    const pe = Number(precioExcedente);
    if ([cf, cb, pe].some((n) => Number.isNaN(n) || n < 0)) {
      Alert.alert("Datos inválidos", "Los tres valores deben ser números mayores o iguales a 0.");
      return;
    }
    if (!fechaValida(vigenteDesde)) {
      Alert.alert("Fecha inválida", "Usá el formato AAAA-MM-DD (por ejemplo, 2026-06-12).");
      return;
    }
    // La nueva tarifa no puede regir antes que la vigente actual (no se reescribe el pasado).
    if (vigente && vigenteDesde < vigente.vigente_desde) {
      Alert.alert(
        "Fecha incoherente",
        `La tarifa vigente rige desde ${vigente.vigente_desde}. La nueva no puede empezar antes.`
      );
      return;
    }

    Alert.alert(
      "Confirmar nueva tarifa",
      `Se creará una tarifa vigente desde ${vigenteDesde}. La anterior se conserva en el histórico. ¿Confirmás?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          onPress: async () => {
            setSaving(true);
            // INSERT (no UPDATE): preserva el histórico. organizacion_id lo pone el trigger.
            const { error } = await supabase.from("tarifas").insert({
              cargo_fijo: cf,
              consumo_base_m3: cb,
              precio_excedente_m3: pe,
              vigente_desde: vigenteDesde,
            });
            setSaving(false);
            if (error) {
              Alert.alert("Error", error.message);
              return;
            }
            Alert.alert("Listo", "Nueva tarifa vigente cargada.");
            setLoading(true);
            load().finally(() => setLoading(false));
          },
        },
      ]
    );
  }, [cargoFijo, consumoBase, precioExcedente, vigenteDesde, vigente, load]);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1a73e8" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tarifa vigente */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tarifa vigente</Text>
        {vigente ? (
          <>
            <Fila label="Cargo fijo" valor={formatCOP(vigente.cargo_fijo)} />
            <Fila label="Consumo base" valor={`${vigente.consumo_base_m3} m³`} />
            <Fila label="Precio excedente (por m³)" valor={formatCOP(vigente.precio_excedente_m3)} />
            <Fila label="Vigente desde" valor={vigente.vigente_desde} />
          </>
        ) : (
          <Text style={styles.empty}>No hay tarifa cargada todavía.</Text>
        )}
      </View>

      {/* Cargar nueva */}
      <Text style={styles.sectionTitle}>Cargar nueva tarifa</Text>
      <Text style={styles.sectionHint}>
        Los valores arrancan con la tarifa actual. Modificá lo que haga falta y guardá:
        se crea una nueva tarifa, sin borrar la anterior.
      </Text>

      <Campo
        label="Cargo fijo ($)"
        value={cargoFijo}
        onChangeText={setCargoFijo}
        keyboardType="numeric"
      />
      <Campo
        label="Consumo base (m³ incluidos en el cargo fijo)"
        value={consumoBase}
        onChangeText={setConsumoBase}
        keyboardType="numeric"
      />
      <Campo
        label="Precio excedente por m³ ($)"
        value={precioExcedente}
        onChangeText={setPrecioExcedente}
        keyboardType="numeric"
      />
      <DateField
        label="Vigente desde"
        value={vigenteDesde}
        onChange={setVigenteDesde}
      />

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.disabled]}
        onPress={guardar}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? "Guardando..." : "Guardar nueva tarifa"}</Text>
      </TouchableOpacity>

      {/* Histórico */}
      {historico.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Historial de tarifas</Text>
          {historico.map((t) => (
            <View key={t.id} style={styles.histItem}>
              <Text style={styles.histDate}>Desde {t.vigente_desde}</Text>
              <Text style={styles.histLine}>
                Cargo fijo {formatCOP(t.cargo_fijo)} · base {t.consumo_base_m3} m³ · excedente{" "}
                {formatCOP(t.precio_excedente_m3)}/m³
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaLabel}>{label}</Text>
      <Text style={styles.filaValor}>{valor}</Text>
    </View>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#999" {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1a73e8", marginBottom: 12 },
  fila: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#f5f5f5" },
  filaLabel: { fontSize: 14, color: "#666" },
  filaValor: { fontSize: 14, color: "#333", fontWeight: "600" },
  empty: { color: "#999", fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#333", marginBottom: 6, marginTop: 8 },
  sectionHint: { fontSize: 13, color: "#888", marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, color: "#666", marginBottom: 6, fontWeight: "500" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
  },
  saveBtn: { backgroundColor: "#1a73e8", padding: 16, borderRadius: 8, alignItems: "center", marginTop: 8, marginBottom: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  histItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  histDate: { fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 4 },
  histLine: { fontSize: 13, color: "#777" },
});
