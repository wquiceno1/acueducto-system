import { Tabs, router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { supabase } from "../../lib/supabase";
import { getMyRole } from "../../lib/auth";

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
        options={{ title: "Resumen", tabBarIcon: () => <Text>📊</Text> }}
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
