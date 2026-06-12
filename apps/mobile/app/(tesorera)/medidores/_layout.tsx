import { Stack } from "expo-router";

// Stack interno de la pestaña Medidores: lista (index) -> detalle/form ([id]).
export default function MedidoresLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: "#1a73e8" }}>
      <Stack.Screen name="index" options={{ title: "Medidores" }} />
      <Stack.Screen name="[id]" options={{ title: "Medidor" }} />
    </Stack>
  );
}
