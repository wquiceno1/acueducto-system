import { Tabs, router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import { getMyRole } from "../../lib/auth";
import { setBiometricEnabled } from "../../lib/biometrics";

// Botón de cerrar sesión (en el header de Resumen).
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

// Zona de la tesorera (rol admin) y del super_admin. Guard de rol: si entra un
// usuario que no corresponde (deep link, sesión vieja), lo manda al login.
// El guard es UX, no seguridad: la barrera real es RLS en la base.
export default function TesoreraLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/");
        return;
      }
      const role = await getMyRole();
      if (role !== "admin" && role !== "super_admin") {
        router.replace("/");
        return;
      }
      setReady(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#1a73e8" }}>
      <Tabs.Screen
        name="resumen"
        options={{
          title: "Resumen",
          tabBarIcon: () => <Text>📊</Text>,
          headerRight: () => <BotonSalir />,
        }}
      />
      <Tabs.Screen
        name="cobranza"
        options={{ title: "Cobranza", tabBarIcon: () => <Text>💰</Text> }}
      />
      <Tabs.Screen
        name="suscriptores"
        options={{ title: "Suscriptores", tabBarIcon: () => <Text>👥</Text> }}
      />
      <Tabs.Screen
        name="medidores"
        options={{ title: "Medidores", tabBarIcon: () => <Text>🚰</Text> }}
      />
      <Tabs.Screen
        name="tarifa"
        options={{ title: "Tarifa", tabBarIcon: () => <Text>💲</Text> }}
      />
    </Tabs>
  );
}
