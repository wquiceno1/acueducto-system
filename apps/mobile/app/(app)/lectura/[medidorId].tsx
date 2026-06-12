import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../../../lib/supabase";
import { saveLecturaLocally, getMedidores, getUltimaLectura, getHistorialLecturas } from "../../../lib/database";
import { syncNow } from "../../../hooks/useSync";
import "react-native-get-random-values";
import { randomUUID } from "expo-crypto";

export default function LecturaScreen() {
  const { medidorId } = useLocalSearchParams<{ medidorId: string }>();
  const [medidor, setMedidor] = useState<any>(null);
  const [lecturaAnterior, setLecturaAnterior] = useState<number | null>(null);
  const [lecturaActual, setLecturaActual] = useState("");
  const [notas, setNotas] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historialVisible, setHistorialVisible] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);

  useEffect(() => {
    const medidores = getMedidores();
    const found = medidores.find((m) => m.id === medidorId);
    setMedidor(found ?? null);
    setLecturaAnterior(getUltimaLectura(medidorId));
    setHistorial(getHistorialLecturas(medidorId));
  }, [medidorId]);

  async function pickImage() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) setFoto(result.assets[0].uri);
  }

  async function handleSave() {
    if (!lecturaActual) {
      Alert.alert("Error", "Ingresá la lectura actual");
      return;
    }
    const anterior = lecturaAnterior ?? 0;
    const actual = parseFloat(lecturaActual);

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert("Error", "Sesión expirada. Ingresá nuevamente.");
      router.replace("/");
      return;
    }

    saveLecturaLocally({
      id: randomUUID(),
      medidor_id: medidorId,
      operario_id: session.user.id,
      lectura_anterior: anterior,
      lectura_actual: actual,
      fecha_lectura: new Date().toISOString().split("T")[0],
      foto_url: foto ?? undefined,
      notas: notas || undefined,
      sync_status: "pendiente",
      created_at: new Date().toISOString(),
    });

    const netState = await NetInfo.fetch();
    if (netState.isConnected) await syncNow();
    setSaving(false);
    const mensaje = netState.isConnected
      ? "Lectura guardada y sincronizada."
      : "Lectura guardada localmente. Se enviará cuando recuperes señal.";
    Alert.alert("Guardado", mensaje, [
      { text: "OK", onPress: () => router.back() },
    ]);
  }

  const actualNum = lecturaActual ? parseFloat(lecturaActual) : null;
  const lecturaInvalida = actualNum !== null && actualNum < (lecturaAnterior ?? 0);
  const consumo = actualNum !== null && !lecturaInvalida
    ? actualNum - (lecturaAnterior ?? 0)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {medidor && (
        <View style={styles.medidorInfo}>
          <Text style={styles.serial}>Medidor #{medidor.numero_serie}</Text>
          <Text style={styles.owner}>
            {medidor.suscriptor_apellido}, {medidor.suscriptor_nombre}
          </Text>
          <Text style={styles.address}>{medidor.suscriptor_direccion}</Text>
        </View>
      )}

      <Text style={styles.label}>Lectura anterior (m³)</Text>
      <View style={styles.inputReadonly}>
        <Text style={styles.inputReadonlyText}>
          {lecturaAnterior !== null ? lecturaAnterior.toString() : "Sin registros previos"}
        </Text>
      </View>

      <Text style={styles.label}>Lectura actual (m³)</Text>
      <TextInput
        style={[styles.input, lecturaInvalida && styles.inputError]}
        value={lecturaActual}
        onChangeText={setLecturaActual}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="#999"
      />
      {lecturaInvalida && (
        <Text style={styles.errorText}>Valor menor a la lectura anterior</Text>
      )}

      {consumo !== null && (
        <View style={styles.consumoBox}>
          <Text style={styles.consumoLabel}>Consumo</Text>
          <Text style={styles.consumoValue}>{consumo.toFixed(2)} m³</Text>
        </View>
      )}

      <Text style={styles.label}>Foto del medidor</Text>
      <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
        {foto ? (
          <Image source={{ uri: foto }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoButtonText}>Tomar foto</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Notas (opcional)</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={notas}
        onChangeText={setNotas}
        placeholder="Observaciones..."
        placeholderTextColor="#999"
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity
        style={styles.historialToggle}
        onPress={() => setHistorialVisible(!historialVisible)}
      >
        <Text style={styles.historialToggleText}>
          {historialVisible ? "▲ Ocultar historial" : "▼ Ver historial de consumos"}
        </Text>
      </TouchableOpacity>

      {historialVisible && (
        <View style={styles.historialContainer}>
          {historial.length === 0 ? (
            <Text style={styles.historialVacio}>Sin registros anteriores.</Text>
          ) : (
            historial.map((h, i) => (
              <View key={i} style={styles.historialFila}>
                <Text style={styles.historialFecha}>{h.fecha_lectura}</Text>
                <Text style={styles.historialDato}>{h.lectura_anterior} → {h.lectura_actual}</Text>
                <Text style={styles.historialConsumo}>{h.consumo} m³</Text>
              </View>
            ))
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveButton, (saving || lecturaInvalida || !lecturaActual) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving || lecturaInvalida || !lecturaActual}
      >
        <Text style={styles.saveButtonText}>
          {saving ? "Guardando..." : "Guardar lectura"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, paddingBottom: 40 },
  medidorInfo: {
    backgroundColor: "#1a73e8",
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  serial: { color: "#fff", fontWeight: "700", fontSize: 16 },
  owner: { color: "#fff", fontSize: 15, marginTop: 4 },
  address: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 },
  label: { fontSize: 14, fontWeight: "600", color: "#444", marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: "#333",
  },
  inputError: { borderColor: "#ef4444" },
  errorText: { fontSize: 12, color: "#ef4444", marginTop: 4 },
  inputReadonly: {
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 14,
  },
  inputReadonlyText: { fontSize: 16, color: "#888" },
  textarea: { height: 80, textAlignVertical: "top" },
  consumoBox: {
    backgroundColor: "#e8f4fd",
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  consumoLabel: { fontSize: 15, color: "#1a73e8", fontWeight: "600" },
  consumoValue: { fontSize: 22, fontWeight: "700", color: "#1a73e8" },
  photoButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoButtonText: { color: "#1a73e8", fontSize: 15, fontWeight: "600" },
  photoPreview: { width: "100%", height: "100%", resizeMode: "cover" },
  saveButton: {
    backgroundColor: "#1a73e8",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  historialToggle: {
    marginTop: 20,
    paddingVertical: 10,
    alignItems: "center",
  },
  historialToggleText: { color: "#1a73e8", fontSize: 14, fontWeight: "600" },
  historialContainer: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 4,
  },
  historialFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  historialFecha: { fontSize: 13, color: "#666", flex: 1 },
  historialDato: { fontSize: 13, color: "#444", flex: 1, textAlign: "center" },
  historialConsumo: { fontSize: 13, fontWeight: "700", color: "#1a73e8", flex: 1, textAlign: "right" },
  historialVacio: { padding: 14, color: "#999", fontSize: 13, textAlign: "center" },
});
