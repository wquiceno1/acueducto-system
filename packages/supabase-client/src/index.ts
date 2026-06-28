import {
  createClient,
  SupabaseClient,
  SupabaseClientOptions,
} from "@supabase/supabase-js";

// Las opciones son opcionales: el web llama sin opciones (default de browser);
// mobile pasa el storage adapter (AsyncStorage) + flags de persistencia.
export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: SupabaseClientOptions<"public">
): SupabaseClient {
  return createClient(url, anonKey, options);
}

export * from "@acueducto/types";
