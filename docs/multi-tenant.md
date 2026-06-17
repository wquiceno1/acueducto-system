# Plan: ajustes de schema para soporte multi-acueducto (multi-tenant)

## Contexto

Hoy el sistema asume **una sola comunidad/acueducto**:

- `packages/types/src/index.ts` no tiene ningún concepto de organización/tenant.
- Las tarifas (`apps/web/lib/tarifas.ts`) están **hardcodeadas** como constantes (`CARGO_FIJO`, `CONSUMO_BASE_M3`, `PRECIO_EXCEDENTE_M3`) — cada comunidad aprueba las suyas en asamblea.
- No existe tabla de usuarios/roles ni RLS — `UserRole` (`admin | operario | vecino`) está definido en `packages/types` pero no se usa en ningún lado.
- No hay carpeta de migraciones (`supabase/`) — el schema se armó a mano en el dashboard de Supabase.

Si en el futuro otra comunidad ("la vecina") quiere usar el sistema, agregar `organizacion_id` y RLS **después de tener datos reales en producción** es riesgoso (migración de datos + riesgo de fuga entre comunidades). Hacerlo ahora, con poca o ninguna data real, es barato.

**Objetivo de este plan**: dejar el schema preparado para multi-tenant (organizaciones, tarifas por organización, roles + RLS) sin construir nada de "aparato SaaS" (billing, onboarding self-service, panel de super-admin) — eso se deja para cuando haya demanda real.

---

## Pasos

### 1. Setup de Supabase CLI + migraciones versionadas — ✅ COMPLETADO (2026-06-10)
- CLI instalada (v2.105.0), `supabase init` hecho, `supabase link --project-ref yeakbtfxegtggykknlsn` exitoso.
- `supabase db pull` generó la migración baseline: `supabase/migrations/20260610130331_remote_schema.sql`.
- A partir de acá, todo cambio de schema es una migración SQL versionada (`supabase db push` / nuevas migraciones), no clicks en el dashboard.

### ⚠️ HALLAZGO IMPORTANTE del `db pull` — esto cambia los pasos 4 y 6

El dump del schema remoto reveló que la base de datos **YA TIENE** algo que el código de `apps/web`/`apps/mobile` nunca usa:

- **Tabla `profiles`** ya existe: `id` (FK a `auth.users`), `full_name`, `role` (check `admin|operario|vecino`), `telefono`, `created_at`. Es básicamente lo que íbamos a crear como `perfiles` en el paso 4.
- **RLS YA HABILITADO** en `lecturas`, `medidores`, `profiles`, `suscriptores`, con policies basadas en `get_my_role()` (función `SECURITY DEFINER` que lee `profiles.role` para `auth.uid()`). Ej: `medidores_select` requiere rol `admin` u `operario`.
- **Trigger `on_auth_user_created`** → `handle_new_user()`: al crearse un usuario en `auth.users`, inserta automáticamente una fila en `profiles` con `role` desde `raw_user_meta_data->>'role'` (default `'vecino'`).
- **NO existe** tabla `periodos` (la interfaz `Periodo` en `packages/types` es "Fase 2", aún no tiene tabla).
- **NO existe** `organizacion_id` ni `tarifas` en ningún lado — esto confirma la premisa original del plan.

**Riesgo a verificar (antes de seguir con cualquier paso)**: ni `apps/web/app/dashboard/layout.tsx` ni `apps/mobile` chequean rol — solo verifican que haya `session`. Si los usuarios actuales (tesorera, operario) **no tienen fila en `profiles`** (ej. si sus cuentas se crearon antes de que existiera el trigger), `get_my_role()` devuelve `NULL` y las policies de SELECT (`get_my_role() = ANY(['admin','operario'])`) devuelven **0 filas** — el dashboard mostraría "sin datos" no porque no haya lecturas, sino porque RLS está bloqueando todo silenciosamente. Esto hay que confirmarlo con una query a `profiles` antes de tocar nada más.

### 2. Tabla `organizaciones` + seed de la comunidad actual — ✅ COMPLETADO (2026-06-11)
Aplicado en `supabase/migrations/20260611222654_organizaciones.sql`. Seed: **'Santa Bárbara'** (id `97b9d96e-e8fa-4b39-bbbe-2d1e9b486fbb`). RLS habilitado (policy de select en migración 6).
Nueva migración:
```sql
create table organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

insert into organizaciones (nombre) values ('Acueducto [nombre actual]');
```
(reemplazar `[nombre actual]` por el nombre real de la comunidad)

### 3. Columna `organizacion_id` en tablas existentes — ✅ COMPLETADO (2026-06-11)
Aplicado en `supabase/migrations/20260611222655_organizacion_id_columns.sql`. **`periodos` se omitió** (la tabla no existe). Backfill verificado: suscriptores/medidores/lecturas/profiles quedaron con la org de Santa Bárbara. Se agregaron índices en `organizacion_id`.

Agregar `organizacion_id uuid references organizaciones(id)` a `suscriptores`, `medidores`, `lecturas`, `periodos`. En la misma migración:
- Agregar columna **nullable**
- `update <tabla> set organizacion_id = (select id from organizaciones limit 1)`
- `alter column organizacion_id set not null`

### 4. Tabla `profiles` (usuarios + rol + organización) — ✅ COMPLETADO (2026-06-11)
`organizacion_id` agregado a `profiles` (en la migración del paso 3). Verificado: admin (`0ec56c17…`) y operario (`a8a9c4f0…`) quedaron asociados a Santa Bárbara. El trigger `handle_new_user()` se actualizó (paso 6) para setear la org en nuevos usuarios — usa `raw_user_meta_data->>'organizacion_id'` si viene, sino la única org existente. (Nota: ambos `full_name` siguen en 'Sin nombre', cosmético, no bloquea.)

La tabla `profiles` ya existe con `id`, `full_name`, `role` (check admin/operario/vecino), `telefono`, `created_at`. Falta:

```sql
alter table profiles
  add column organizacion_id uuid references organizaciones(id);

update profiles set organizacion_id = (select id from organizaciones limit 1);

alter table profiles alter column organizacion_id set not null;
```

- **Antes de esto**: verificar con un `select id, full_name, role from profiles` que los usuarios actuales (tesorera, operario) tengan fila acá y el `role` correcto. Si falta alguno, insertarlo manualmente.
- También conviene actualizar `handle_new_user()` para que el trigger setee `organizacion_id` en los nuevos usuarios (hoy no lo hace, porque la columna no existe todavía).
- No se construye flujo de signup/onboarding — los usuarios actuales se conocen y son pocos.

### 5. Tabla `tarifas` (reemplaza las constantes hardcodeadas) — ✅ COMPLETADO (2026-06-11)
Migración `supabase/migrations/20260611222656_tarifas.sql` aplicada, seed con los valores actuales (10000/15/1000). Código actualizado: `apps/web/lib/tarifas.ts` (`calcularCobro(consumoM3, tarifa)`), `apps/web/app/dashboard/page.tsx` (fetch de tarifa vigente + guard hasta que cargue). `TARIFAS` hardcodeado eliminado.

```sql
create table tarifas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  cargo_fijo numeric not null,
  consumo_base_m3 numeric not null,
  precio_excedente_m3 numeric not null,
  vigente_desde date not null default current_date,
  created_at timestamptz not null default now()
);

insert into tarifas (organizacion_id, cargo_fijo, consumo_base_m3, precio_excedente_m3)
values ((select id from organizaciones limit 1), 10000, 15, 1000);
```

Cambios de código asociados:
- `apps/web/lib/tarifas.ts`: `calcularCobro` deja de leer `TARIFAS` hardcodeado y recibe los 3 valores como parámetro (o un objeto `Tarifa`). Mantener `formatCOP` igual.
- `apps/web/app/dashboard/page.tsx`: al cargar datos, hacer fetch de la tarifa vigente de la organización del usuario y pasarla a `calcularCobro`.

### 6. RLS por `organizacion_id` — ✅ COMPLETADO (2026-06-11)
Migración `supabase/migrations/20260611222657_rls_por_organizacion.sql`: se creó `get_my_org()`, se hizo drop+recreate de todas las policies de suscriptores/medidores/lecturas/profiles agregando `organizacion_id = get_my_org()`, y se crearon las de `organizaciones` y `tarifas`. Trigger `handle_new_user()` actualizado para setear org (con fallback a la única org si el signup no la manda).

### 6. RLS por `organizacion_id` — ALTERAR policies existentes, no crear desde cero
RLS ya está habilitado en `suscriptores`, `medidores`, `lecturas`, `profiles` con policies basadas en `get_my_role()`. Hay que **agregar la condición de `organizacion_id`** a cada policy existente (drop + recreate), y crear las nuevas para `tarifas` y `periodos` (cuando exista) cuando se creen.

Patrón: actualizar `get_my_role()` (o agregar una función `get_my_org()` análoga) y añadir el chequeo de organización a cada policy. Ejemplo para `medidores_select`:

```sql
create or replace function "public"."get_my_org"() returns uuid
    language sql stable security definer
    as $$
  select organizacion_id from public.profiles where id = auth.uid();
$$;

drop policy "medidores_select" on "public"."medidores";
create policy "medidores_select" on "public"."medidores"
  for select using (
    organizacion_id = public.get_my_org()
    and (public.get_my_role() = ANY (ARRAY['admin','operario']))
  );
```

Repetir el patrón (drop + recreate agregando `organizacion_id = public.get_my_org()`) para las policies de `lecturas`, `suscriptores`, `medidores` y `profiles`.

### 7. Actualizar `packages/types/src/index.ts` — ✅ COMPLETADO (2026-06-11)
Hecho: `organizacion_id` en `Suscriptor`, `Medidor`, `Lectura`, `Periodo`; nuevas interfaces `Organizacion`, `Tarifa`, `Profile`.

- Agregar `organizacion_id: string` a `Suscriptor`, `Medidor`, `Lectura`, `Periodo`.
- Nuevas interfaces: `Organizacion`, `Tarifa`, `Profile` (con `id`, `full_name`, `role: UserRole`, `telefono`, `organizacion_id`) — refleja la tabla `profiles` ya existente, hoy no tipada en `@acueducto/types`.

### 8. Verificación end-to-end — ✅ WEB VERIFICADO / ⏳ MOBILE PENDIENTE (2026-06-11)
Verificado en vivo con login real de la tesorera (admin): el dashboard muestra usuarios/medidores/consumos (RLS no bloquea) y el "Recaudo estimado" sale en pesos (la tarifa viene de la tabla `tarifas`, no del hardcodeo). Falta solo el punto 4: probar `apps/mobile` con el operario.

1. Aplicar migraciones contra el proyecto Supabase reactivado (`supabase db push`)
2. Levantar `apps/web` (`pnpm dev --filter=web`), login con el usuario tesorera (rol `admin`), confirmar que `/dashboard`, `/dashboard/suscriptores` y `/dashboard/medidores` siguen cargando datos normalmente (RLS no debe bloquear acceso legítimo)
3. Confirmar que el cálculo de cobro en el dashboard usa la tarifa de la tabla `tarifas` (no la constante vieja)
4. Levantar `apps/mobile`, login con el usuario operario, confirmar que la sincronización de medidores/lecturas sigue funcionando
5. (Opcional, sanity check de RLS) Desde el SQL editor de Supabase, correr una query simulando otro `auth.uid()` sin perfil asociado y confirmar que devuelve 0 filas

---

## Fuera de alcance (a propósito)
- Panel de administración de organizaciones
- Flujo de onboarding/self-signup para nuevas comunidades
- Branding/temas por organización
- Billing o gestión de planes
- Cambios al schema SQLite local de `apps/mobile` (no hace falta: RLS ya filtra lo que cada dispositivo descarga)

---

## Contexto adicional / decisiones relacionadas (pendientes)

Estos puntos NO son parte de los pasos de arriba, pero quedaron de la discusión y conviene tenerlos presentes cuando se retome este plan:

- **Decisión pendiente: ¿unificar todo en una app Android (extender `apps/mobile`) o mantener `apps/web` + PWA?** Está sin resolver — la tesorera mostró aversión a usar PC. Se evaluó primero probar `apps/web` como PWA (ya tiene vista mobile en cards en `dashboard/page.tsx`) antes de invertir en pantallas nuevas en RN. Este plan de schema (`organizaciones`, `perfiles` con `role`, `tarifas`, RLS) **es un prerequisito para cualquiera de los dos caminos** — no depende de esa decisión.

- **Plan Free de Supabase se pausa por inactividad (7 días)** — ya pasó una vez en este proyecto. Con multi-tenant (más datos, más organizaciones) esto se vuelve más urgente de resolver; eventualmente va a hacer falta pasar a plan Pro (~$25/mes).

- **Storage de fotos de medidores**: `Lectura.foto_url` hoy es solo una URI local del dispositivo (ImagePicker), no se sube a Supabase Storage todavía. Cuando se implemente el upload, organizar los paths por `organizacion_id` desde el inicio (ej. `lecturas/{organizacion_id}/{lectura_id}.jpg`) para no tener que reordenar archivos después.

- **Rol "vecino" (`UserRole`)**: sugiere un futuro portal de suscriptor para ver su propio consumo/factura. Si se construye, la combinación `perfiles.organizacion_id` + RLS de este plan es exactamente lo que garantiza que un vecino de una comunidad nunca vea datos de otra.
