import { Stack } from "expo-router";

// Stack interno de la pestaña Suscriptores: lista (index) -> detalle/form ([id]).
export default function SuscriptoresLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: "#1a73e8" }}>
      <Stack.Screen name="index" options={{ title: "Suscriptores" }} />
      <Stack.Screen name="[id]" options={{ title: "Suscriptor" }} />
    </Stack>
  );
}
