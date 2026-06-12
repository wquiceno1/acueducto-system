


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select role from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    coalesce(new.raw_user_meta_data->>'role', 'vecino')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."lecturas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "medidor_id" "uuid" NOT NULL,
    "operario_id" "uuid" NOT NULL,
    "lectura_anterior" numeric(10,2) NOT NULL,
    "lectura_actual" numeric(10,2) NOT NULL,
    "consumo" numeric(10,2) GENERATED ALWAYS AS (("lectura_actual" - "lectura_anterior")) STORED,
    "fecha_lectura" "date" DEFAULT CURRENT_DATE NOT NULL,
    "foto_url" "text",
    "notas" "text",
    "sync_status" "text" DEFAULT 'sincronizado'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lecturas_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pendiente'::"text", 'sincronizado'::"text"])))
);


ALTER TABLE "public"."lecturas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medidores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "numero_serie" "text" NOT NULL,
    "suscriptor_id" "uuid" NOT NULL,
    "sector" "text",
    "fecha_instalacion" "date" DEFAULT CURRENT_DATE,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."medidores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "telefono" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'operario'::"text", 'vecino'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suscriptores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "apellido" "text" NOT NULL,
    "direccion" "text" NOT NULL,
    "telefono" "text",
    "email" "text",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."suscriptores" OWNER TO "postgres";


ALTER TABLE ONLY "public"."lecturas"
    ADD CONSTRAINT "lecturas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medidores"
    ADD CONSTRAINT "medidores_numero_serie_key" UNIQUE ("numero_serie");



ALTER TABLE ONLY "public"."medidores"
    ADD CONSTRAINT "medidores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suscriptores"
    ADD CONSTRAINT "suscriptores_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_lecturas_fecha" ON "public"."lecturas" USING "btree" ("fecha_lectura");



CREATE INDEX "idx_lecturas_medidor" ON "public"."lecturas" USING "btree" ("medidor_id");



CREATE INDEX "idx_medidores_suscriptor" ON "public"."medidores" USING "btree" ("suscriptor_id");



ALTER TABLE ONLY "public"."lecturas"
    ADD CONSTRAINT "lecturas_medidor_id_fkey" FOREIGN KEY ("medidor_id") REFERENCES "public"."medidores"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."lecturas"
    ADD CONSTRAINT "lecturas_operario_id_fkey" FOREIGN KEY ("operario_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medidores"
    ADD CONSTRAINT "medidores_suscriptor_id_fkey" FOREIGN KEY ("suscriptor_id") REFERENCES "public"."suscriptores"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."lecturas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lecturas_insert" ON "public"."lecturas" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") OR ("public"."get_my_role"() = 'operario'::"text")));



CREATE POLICY "lecturas_select" ON "public"."lecturas" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") OR ("operario_id" = "auth"."uid"())));



CREATE POLICY "lecturas_update" ON "public"."lecturas" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"text"));



ALTER TABLE "public"."medidores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "medidores_insert" ON "public"."medidores" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "medidores_select" ON "public"."medidores" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'operario'::"text"])));



CREATE POLICY "medidores_update" ON "public"."medidores" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"text"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'admin'::"text")));



ALTER TABLE "public"."suscriptores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suscriptores_insert" ON "public"."suscriptores" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "suscriptores_select" ON "public"."suscriptores" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'operario'::"text"])));



CREATE POLICY "suscriptores_update" ON "public"."suscriptores" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"text"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


















GRANT ALL ON TABLE "public"."lecturas" TO "anon";
GRANT ALL ON TABLE "public"."lecturas" TO "authenticated";
GRANT ALL ON TABLE "public"."lecturas" TO "service_role";



GRANT ALL ON TABLE "public"."medidores" TO "anon";
GRANT ALL ON TABLE "public"."medidores" TO "authenticated";
GRANT ALL ON TABLE "public"."medidores" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."suscriptores" TO "anon";
GRANT ALL ON TABLE "public"."suscriptores" TO "authenticated";
GRANT ALL ON TABLE "public"."suscriptores" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


