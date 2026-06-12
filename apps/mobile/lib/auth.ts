import type { UserRole } from "@acueducto/types";
import { supabase } from "./supabase";

// Lee el rol del usuario logueado desde `profiles`. RLS permite ver el propio
// perfil (id = auth.uid()), así que esta query funciona para cualquier rol.
export async function getMyRole(): Promise<UserRole | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error || !data) return null;
  return data.role as UserRole;
}

// Destino de navegación según el rol. Centraliza el routing por rol para usarlo
// tanto en el login como en los guards de cada zona.
export function routeForRole(role: UserRole | null): string | null {
  if (role === "operario") return "/(app)/medidores";
  if (role === "admin" || role === "super_admin") return "/(tesorera)/resumen";
  return null; // 'vecino' u otro: todavía no tiene sección en la app
}
