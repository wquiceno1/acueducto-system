import { Stack } from "expo-router";

// Stack interno de la pestaña Cobranza: lista de saldos (index) -> estado de cuenta ([id]).
export default function CobranzaLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: "#1a73e8" }}>
      <Stack.Screen name="index" options={{ title: "Cobranza" }} />
      <Stack.Screen name="[id]" options={{ title: "Estado de cuenta" }} />
    </Stack>
  );
}
