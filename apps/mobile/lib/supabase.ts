import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSupabaseClient } from "@acueducto/supabase-client";

export const supabase = createSupabaseClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // En RN no hay URL de browser de la que detectar la sesión.
      detectSessionInUrl: false,
    },
  }
);

// Patrón oficial de Supabase RN: refrescar el token solo cuando la app está activa.
// A nivel de módulo (no en un componente) para registrarlo una sola vez.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
