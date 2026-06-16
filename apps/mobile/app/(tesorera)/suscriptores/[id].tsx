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
} from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { toast, mensajeError, emailValido } from "../../../lib/ui";
import type { Suscriptor } from "@acueducto/types";

export default function SuscriptorFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const esNuevo = id === "nuevo";

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [activo, setActivo] = useState(true);
  const [loading, setLoading] = useState(!esNuevo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: esNuevo ? "Nuevo suscriptor" : "Editar suscriptor" });
  }, [navigation, esNuevo]);

  useEffect(() => {
    if (esNuevo) return;
    (async () => {
      const { data } = await supabase
        .from("suscriptores")
        .select("*")
        .eq("id", id)
        .single();
      if (data) {
        const s = data as Suscriptor;
        setNombre(s.nombre);
        setApellido(s.apellido);
        setDireccion(s.direccion);
        setTelefono(s.telefono ?? "");
        setEmail(s.email ?? "");
        setActivo(s.activo);
      }
      setLoading(false);
    })();
  }, [id, esNuevo]);

  const guardar = useCallback(async () => {
    if (!nombre.trim() || !apellido.trim() || !direccion.trim()) {
      Alert.alert("Faltan datos", "Nombre, apellido y dirección son obligatorios.");
      return;
    }
    if (email.trim() && !emailValido(email.trim())) {
      Alert.alert("Email inválido", "Revisá el formato del email (ej. nombre@dominio.com).");
      return;
    }
    setSaving(true);
    // organizacion_id lo completa el trigger set_organizacion_id (no se manda).
    const payload = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      direccion: direccion.trim(),
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      activo,
    };

    const { error } = esNuevo
      ? await supabase.from("suscriptores").insert(payload)
      : await supabase.from("suscriptores").update(payload).eq("id", id);

    setSaving(false);
    if (error) {
      Alert.alert("Error", mensajeError(error));
      return;
    }
    toast("Guardado");
    router.back();
  }, [nombre, apellido, direccion, telefono, email, activo, esNuevo, id]);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1a73e8" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Campo label="Nombre *" value={nombre} onChangeText={setNombre} />
      <Campo label="Apellido *" value={apellido} onChangeText={setApellido} />
      <Campo label="Dirección *" value={direccion} onChangeText={setDireccion} />
      <Campo
        label="Teléfono"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
      />
      <Campo
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Activo</Text>
        <Switch value={activo} onValueChange={setActivo} />
      </View>
      {!activo && (
        <Text style={styles.hint}>
          Un suscriptor inactivo deja de aparecer en cobros, pero su histórico se conserva.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.disabled]}
        onPress={guardar}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? "Guardando..." : "Guardar"}</Text>
      </TouchableOpacity>
    </ScrollView>
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
});
