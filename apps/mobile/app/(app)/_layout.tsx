import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSync } from "../../hooks/useSync";

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
      <Stack.Screen name="medidores" options={{ title: "Medidores", headerBackVisible: false }} />
      <Stack.Screen name="lectura/[medidorId]" options={{ title: "Nueva Lectura" }} />
    </Stack>
  );
}
