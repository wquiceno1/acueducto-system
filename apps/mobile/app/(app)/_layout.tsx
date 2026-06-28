import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import { useSync } from "../../hooks/useSync";
import { setBiometricEnabled } from "../../lib/biometrics";

// Botón de cerrar sesión (header de la pantalla del operario).
function BotonSalir() {
  function confirmar() {
    Alert.alert("Cerrar sesión", "¿Querés salir de tu cuenta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          // Limpiar el gate de huella para que no quede apuntando a una sesión cerrada.
          await setBiometricEnabled(false);
          await supabase.auth.signOut();
          router.replace("/");
        },
      },
    ]);
  }
  return (
    <TouchableOpacity onPress={confirmar} style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: "#1a73e8", fontSize: 14, fontWeight: "500" }}>Salir</Text>
    </TouchableOpacity>
  );
}

export default function AppLayout() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/");
        return;
      }
      setUserId(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") router.replace("/");
      if (session) setUserId(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useSync(userId);

  return (
    <Stack>
      <Stack.Screen
        name="medidores"
        options={{ title: "Medidores", headerBackVisible: false, headerRight: () => <BotonSalir /> }}
      />
      <Stack.Screen name="lectura/[medidorId]" options={{ title: "Nueva Lectura" }} />
    </Stack>
  );
}
