import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

// Parsea "AAAA-MM-DD" como fecha LOCAL (evita el corrimiento de día por timezone
// que produce new Date("2026-06-12")).
function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date();
}

// Formatea una Date a "AAAA-MM-DD" usando los componentes locales (sin UTC).
function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Campo de fecha: muestra el valor y abre el calendario nativo al tocarlo.
// Trabaja con strings "AAAA-MM-DD" para encajar con el resto de los formularios.
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
        <Text style={styles.value}>{value || "Elegir fecha"}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={parseLocal(value)}
          mode="date"
          onChange={(event, selected) => {
            setShow(false); // en Android el diálogo se cierra solo
            if (event.type === "set" && selected) {
              onChange(formatLocal(selected));
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 13, color: "#666", marginBottom: 6, fontWeight: "500" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
  },
  value: { fontSize: 16, color: "#333" },
});
