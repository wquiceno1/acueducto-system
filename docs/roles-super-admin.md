# Plan: separación de rol `super_admin` (admin ultra) vs `admin` de comunidad

## Contexto

Hoy el sistema tiene 3 roles (`UserRole` = `admin | operario | vecino`) y la tesorera
es `admin`. Con el multi-tenant ya implementado, RLS aísla a cada `admin` a su
propia comunidad vía `organizacion_id = get_my_org()`.

La decisión tomada (charlada con el usuario):

- **La tesorera es la `admin` de SU comunidad** — conserva TODOS sus permisos
  actuales (alta de medidores, editar/borrar suscriptores, cambiar tarifas), pero
  no puede hacer nada en otras comunidades. **Esto ya funciona hoy, no se toca.**
- **El usuario (dueño del sistema) es un rol nuevo `super_admin` ("admin ultra")** —
  opera por encima de las organizaciones: puede gestionar cualquier/todas las
  comunidades desde el dashboard web. Hoy NO existe ese rol ni esa cuenta.

### Por qué este plan (el concepto de fondo)

La separación NO puede ser "solo de interfaz". Una frontera de seguridad vive en
los **datos (rol + RLS)**, nunca en la UI: ocultar el dashboard o no dar un link
no impide nada, porque cualquiera con rol `admin` puede llamar la API directo.
*Never trust the client.* Por eso `super_admin` se modela como un rol real con
permisos reales, no como un flag de pantalla.

Lo que YA está blindado (no depende de este plan): el aislamiento **entre**
comunidades. La tesorera de Santa Bárbara jamás verá datos de otra comunidad,
aunque sea admin, aunque abra el dashboard, aunque toque la API. RLS por
`organizacion_id` lo garantiza.

### Estado verificado del código (2026-06-11)

- No hay signup público: solo `signInWithPassword` en `apps/web/app/login/page.tsx`
  y `apps/mobile/app/index.tsx`. Las cuentas se crean a mano en el dashboard.
- `apps/web/app/dashboard/layout.tsx` y `apps/mobile/app/(app)/_layout.tsx` solo
  verifican `session`, NO el rol.
- El trigger `handle_new_user()` setea `role` leyéndolo de
  `raw_user_meta_data->>'role'` (default `'vecino'`). Ver paso 2 — esto es un
  riesgo latente que conviene cerrar al introducir un rol privilegiado.

---

## La distinción de roles (estado objetivo)

| Rol | Alcance (qué filas) | Acciones | Interfaz |
|-----|---------------------|----------|----------|
| `super_admin` (vos) | **TODAS** las organizaciones | Todo | Dashboard web |
| `admin` (tesorera) | Solo su `organizacion_id` | Todo dentro de su comunidad | Sección nativa (app) |
| `operario` | Solo su `organizacion_id` | Lecturas | Sección nativa (app) |
| `vecino` (futuro) | Solo su `organizacion_id` | Ver su consumo | — |

Dos dimensiones independientes: **alcance** (super_admin cruza comunidades; el
resto está acotado a la suya) y **acción** (admin/super_admin hacen todo; operario
limitado).

---

## Pasos

### 1. Agregar `super_admin` al modelo de roles — ✅ COMPLETADO (2026-06-11)
Migración `20260611230227_rol_super_admin.sql` (constraint) + `packages/types/src/index.ts` (union ampliada).

- **DB**: el `role` de `profiles` es `text` con CHECK
  `role = ANY (ARRAY['admin','operario','vecino'])`. Migración: drop + recreate del
  constraint agregando `'super_admin'`.
  ```sql
  alter table public.profiles drop constraint profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role = any (array['super_admin','admin','operario','vecino']));
  ```
- **Tipos**: en `packages/types/src/index.ts`, ampliar la union:
  `export type UserRole = "super_admin" | "admin" | "operario" | "vecino";`

### 2. Cerrar el agujero del trigger `handle_new_user` (seguridad) — ✅ COMPLETADO (2026-06-11)
Aplicado en `20260611230227_rol_super_admin.sql` (misma migración del paso 1).

**Problema**: hoy el trigger asigna `role` desde `raw_user_meta_data->>'role'`, que
es metadata controlable por el cliente (`user_metadata`). Si en el futuro se
habilita signup público, cualquiera podría auto-asignarse `role='admin'` o
`'super_admin'` mandándolo en el signup. Hoy el riesgo es **latente** (no hay
signup público), pero introducir un rol privilegiado es el momento de cerrarlo.

**Decisión tomada: (a) default seguro + promoción manual.** El trigger siempre crea
con `role='vecino'` (ignora cualquier `role` que venga en metadata); los roles
privilegiados (`admin`, `super_admin`) se asignan a mano con un UPDATE. Cero
superficie de ataque. Alcanza porque las cuentas se crean a mano y son pocas.
```sql
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role, organizacion_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    'vecino',  -- siempre el rol mínimo; la promoción a admin/super_admin es manual
    coalesce(
      (new.raw_user_meta_data->>'organizacion_id')::uuid,
      (select id from public.organizaciones order by created_at limit 1)
    )
  );
  return new;
end;
$$;
```

### 3. RLS: dar alcance cross-org a `super_admin` — ✅ COMPLETADO (2026-06-11)
Migración `20260611230228_rls_super_admin_cross_org.sql`: `can_access_org()` + drop/recreate de TODAS las policies (organizaciones, tarifas, suscriptores, medidores, lecturas, profiles) sumando `super_admin`.

Las policies actuales son del patrón `organizacion_id = get_my_org() AND <rol>`.
Para que `super_admin` trascienda comunidades, se centraliza el alcance en una
función helper y se incluye `super_admin` en los chequeos de acción.

```sql
-- ¿el usuario actual puede operar sobre filas de esta organizacion?
create or replace function public.can_access_org(row_org uuid) returns boolean
  language sql stable security definer as $$
  select public.get_my_role() = 'super_admin' or row_org = public.get_my_org();
$$;
```

Patrón de reescritura (drop + recreate) de cada policy. Ejemplo `medidores_select`:
```sql
drop policy "medidores_select" on public.medidores;
create policy "medidores_select" on public.medidores
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin','operario'])
  );
```
Se repite el patrón (reemplazar el chequeo de org por `can_access_org(...)` y
sumar `'super_admin'` a los arrays de rol donde hoy figura `'admin'`) en todas las
policies de `suscriptores`, `medidores`, `lecturas`, `profiles`, `tarifas`,
`organizaciones`.

**Decisión tomada: se escribe ahora.** Con UNA sola comunidad `super_admin` se
comporta igual que `admin` (no hay otra org que ver), pero dejamos la frontera
completa y blindada para la 2ª comunidad.

### 4. Crear la cuenta `super_admin` — ✅ COMPLETADO (2026-06-11)
Cuenta 'William Quiceno' (id `5e49f771-c8f8-4ba8-af49-5c56cc915106`) creada en el dashboard y promovida a `super_admin` con UPDATE. El trigger la dio de alta como vecino+Santa Bárbara automáticamente (validó el paso 2).

- Crear el usuario del dueño (dashboard de Supabase o Admin API).
- Asignarle `role='super_admin'` en `profiles` (UPDATE manual, dado el paso 2a).
- `organizacion_id`: la columna es NOT NULL, así que se le asigna una org "home"
  (ej. Santa Bárbara). Su poder cross-org viene del ROL, no de esa columna — las
  policies de `super_admin` ignoran `get_my_org()`.

### 5. Routing y guard por rol en las apps
Hoy los layouts solo miran `session`. Hay que leer el rol del perfil y enrutar:
- **Web** (`apps/web/app/dashboard/layout.tsx`): **decisión tomada → solo
  `super_admin`**. Si entra `admin`/`operario`/`vecino`, redirigir.
- **Mobile** (`apps/mobile/app/(app)/_layout.tsx`): según rol, mostrar la sección
  del operario o la de la tesorera (`admin`).
- El guard de UI es UX, no seguridad: la barrera real ya es RLS (pasos 1–3). El
  guard solo evita que alguien vea una pantalla que no le sirve.

> ⚠️ **DEPENDENCIA DE SECUENCIA — crítica.** Hoy la tesorera (`admin`) usa el
> dashboard web. Si se aplica el guard "solo super_admin" **antes** de que exista
> su sección nativa (que es *fuera de alcance* de este plan), la tesorera queda
> **sin ninguna interfaz**. Por lo tanto el guard restrictivo del web NO se activa
> hasta que la sección nativa de la tesorera esté lista. Mientras tanto el web
> sigue dejando entrar también a `admin`. El estado objetivo es "solo super_admin",
> pero la transición exige ese orden para no dejar a la tesorera en el aire.

---

## Fuera de alcance (otro plan / otra fase)

- **La sección nativa de la tesorera** (pantallas RN al estilo de las del operario:
  ver consumos/cobros del mes, registrar pagos, etc.). Eso es trabajo de UI y
  merece su propio plan; este plan solo deja el modelo de roles y el routing
  listos para colgarla.
- Onboarding/self-signup de nuevas comunidades o tesoreras.
- Panel de super-admin para gestionar organizaciones (alta/baja de comunidades).

---

## Decisiones tomadas (2026-06-11)

1. **Paso 2** → (a) default seguro `'vecino'` + promoción manual.
2. **Paso 3** → RLS cross-org se escribe ahora.
3. **Paso 5 web** → estado objetivo "solo `super_admin`", PERO el guard restrictivo
   se difiere hasta que exista la sección nativa de la tesorera (ver dependencia de
   secuencia en el paso 5). Hasta entonces el web sigue admitiendo `admin`.

## Orden de ejecución propuesto

- **Ahora, autónomo (migraciones)**: pasos 1, 2 y 3. No afectan a la tesorera (sigue
  `admin`, acotada a su org; el cross-org solo aplica a `super_admin`).
- **Ahora, requiere tu colaboración**: paso 4 — crear la cuenta `super_admin`. No
  puedo crear un usuario de auth sin que vos lo crees en el dashboard (o me pases
  acceso a la Admin API); una vez exista, yo le hago el UPDATE de `role`.
- **Diferido**: el guard restrictivo del web (paso 5) hasta tener la sección nativa
  de la tesorera. El routing mobile se hace junto con esa sección (otro plan).
