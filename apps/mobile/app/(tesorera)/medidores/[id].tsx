import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { toast, mensajeError } from "../../../lib/ui";
import { DateField } from "../../../components/DateField";
import type { Medidor, Suscriptor } from "@acueducto/types";

function hoyISO() {
  return new Date().toISOString().split("T")[0];
}

export default function MedidorFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const esNuevo = id === "nuevo";

  const [numeroSerie, setNumeroSerie] = useState("");
  const [suscriptorId, setSuscriptorId] = useState<string | null>(null);
  const [sector, setSector] = useState("");
  const [fechaInstalacion, setFechaInstalacion] = useState(hoyISO());
  const [activo, setActivo] = useState(true);

  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(!esNuevo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: esNuevo ? "Nuevo medidor" : "Editar medidor" });
  }, [navigation, esNuevo]);

  // Suscriptores activos para el selector.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("suscriptores")
        .select("*")
        .eq("activo", true)
        .order("apellido", { ascending: true });
      setSuscriptores((data ?? []) as Suscriptor[]);
    })();
  }, []);

  // Datos del medidor en edición.
  useEffect(() => {
    if (esNuevo) return;
    (async () => {
      const { data } = await supabase.from("medidores").select("*").eq("id", id).single();
      if (data) {
        const m = data as Medidor;
        setNumeroSerie(m.numero_serie);
        setSuscriptorId(m.suscriptor_id);
        setSector(m.sector ?? "");
        setFechaInstalacion(m.fecha_instalacion ?? hoyISO());
        setActivo(m.activo);
      }
      setLoading(false);
    })();
  }, [id, esNuevo]);

  const suscriptorElegido = suscriptores.find((s) => s.id === suscriptorId);

  const guardar = useCallback(async () => {
    if (!numeroSerie.trim()) {
      Alert.alert("Faltan datos", "El número de serie es obligatorio.");
      return;
    }
    if (!suscriptorId) {
      Alert.alert("Faltan datos", "Elegí a qué suscriptor pertenece el medidor.");
      return;
    }
    setSaving(true);
    // organizacion_id lo completa el trigger set_organizacion_id (no se manda).
    const payload = {
      numero_serie: numeroSerie.trim(),
      suscriptor_id: suscriptorId,
      sector: sector.trim() || null,
      fecha_instalacion: fechaInstalacion || hoyISO(),
      activo,
    };

    const { error } = esNuevo
      ? await supabase.from("medidores").insert(payload)
      : await supabase.from("medidores").update(payload).eq("id", id);

    setSaving(false);
    if (error) {
      Alert.alert("Error", mensajeError(error));
      return;
    }
    toast("Guardado");
    router.back();
  }, [numeroSerie, suscriptorId, sector, fechaInstalacion, activo, esNuevo, id]);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1a73e8" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.field}>
        <Text style={styles.label}>Número de serie *</Text>
        <TextInput
          style={styles.input}
          value={numeroSerie}
          onChangeText={setNumeroSerie}
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Suscriptor *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setPickerVisible(true)}>
          <Text style={suscriptorElegido ? styles.selectText : styles.selectPlaceholder}>
            {suscriptorElegido
              ? `${suscriptorElegido.apellido}, ${suscriptorElegido.nombre}`
              : "Seleccionar suscriptor"}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Sector</Text>
        <TextInput
          style={styles.input}
          value={sector}
          onChangeText={setSector}
          placeholderTextColor="#999"
        />
      </View>

      <DateField
        label="Fecha de instalación"
        value={fechaInstalacion}
        onChange={setFechaInstalacion}
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Activo</Text>
        <Switch value={activo} onValueChange={setActivo} />
      </View>
      {!activo && (
        <Text style={styles.hint}>
          Un medidor inactivo deja de aparecer en las lecturas, pero su histórico se conserva.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.disabled]}
        onPress={guardar}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? "Guardando..." : "Guardar"}</Text>
      </TouchableOpacity>

      {/* Selector de suscriptor */}
      <Modal visible={pickerVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Elegí un suscriptor</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={styles.modalClose}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={suscriptores}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSuscriptorId(item.id);
                    setPickerVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>
                    {item.apellido}, {item.nombre}
                  </Text>
                  <Text style={styles.modalItemSub}>{item.direccion}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No hay suscriptores activos.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16 },
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
  select: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectText: { fontSize: 16, color: "#333" },
  selectPlaceholder: { fontSize: 16, color: "#999" },
  chevron: { fontSize: 22, color: "#1a73e8" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  hint: { fontSize: 12, color: "#888", marginBottom: 14 },
  saveBtn: {
    backgroundColor: "#1a73e8",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modalTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  modalClose: { fontSize: 15, color: "#1a73e8", fontWeight: "500" },
  modalItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  modalItemText: { fontSize: 15, color: "#333", fontWeight: "500" },
  modalItemSub: { fontSize: 13, color: "#888", marginTop: 2 },
  modalEmpty: { textAlign: "center", color: "#999", padding: 24 },
});
