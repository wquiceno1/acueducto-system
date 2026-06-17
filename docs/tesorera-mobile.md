# Plan: zona de la tesorera en la app mobile (Expo)

## Contexto

La tesorera (`role = 'admin'`) hoy usa el **dashboard web**. La decisión de producto
(ver plan de roles) es darle su propia zona **en la app mobile**, para que opere
desde el celular sin depender del PC. El operario ya tiene su zona en la misma app;
la idea es **una sola app con routing por rol**, no dos apps.

### Decisiones de producto tomadas (2026-06-11)

- **Alcance**: consultar **+ gestionar**. La tesorera ve el resumen de consumos/cobros
  del mes Y puede dar de alta medidores, editar/borrar suscriptores y cambiar tarifas.
- **Conectividad**: **online** (fetch directo a Supabase, como el dashboard web). NO
  offline-first. La tesorera trabaja con wifi, no en terreno → no toca SQLite ni sync.
- **Pagos/cobranza**: **fuera de alcance** por ahora (sería tabla nueva + RLS + UI).

### Estado del código mobile (verificado 2026-06-11)

- **Expo Router**: `app/index.tsx` (login) + grupo protegido `app/(app)/` con
  `_layout.tsx` que valida `session` y corre `useSync`. Pantallas del operario:
  `(app)/medidores.tsx`, `(app)/lectura/[medidorId].tsx`.
- **Punto clave**: el login (`index.tsx`) hace `router.replace("/(app)/medidores")`
  **sin mirar el rol**. Acá se inserta el enrutado por rol.
- **Offline del operario**: SQLite (`lib/database.ts`) + `useSync`. **La tesorera NO
  usa nada de esto** (es online) — su código es independiente del de SQLite.
- **UI**: estilos nativos RN (`StyleSheet`), `FlatList` + cards, search, azul
  `#1a73e8`. Se reutiliza el patrón visual, no se comparte código de UI con el web.
- **Client Supabase**: `apps/mobile/lib/supabase.ts` ya existe. RLS ya protege todo
  por rol+org, así que el fetch de la tesorera no necesita filtros manuales de org.

---

## Arquitectura propuesta

### Routing por rol (una app, tres destinos)
Tras el login, leer `profiles.role` (`select role from profiles where id = auth.uid()`,
permitido por RLS) y enrutar:

| Rol | Destino en mobile |
|-----|-------------------|
| `operario` | `/(app)/medidores` (lo actual, sin cambios) |
| `admin` (tesorera) | `/(tesorera)/resumen` (zona nueva) |
| `super_admin` | `/(tesorera)/resumen` también (puede ver/gestionar; su lugar natural es el web, pero si entra a mobile, ve la zona de gestión) |

El enrutado va en dos lugares: el login (`index.tsx`) y un guard en cada `_layout`
(para deep links / sesión ya iniciada).

### Estructura de archivos nueva
```
app/(tesorera)/
  _layout.tsx            # Tabs: Resumen | Suscriptores | Medidores | Tarifa
  resumen.tsx            # consumos/cobros del mes (consulta)
  suscriptores/
    index.tsx            # lista + buscar
    [id].tsx             # crear / editar / borrar
  medidores/
    index.tsx            # lista + buscar
    [id].tsx             # alta / editar
  tarifa.tsx             # ver tarifa vigente + cargar nueva
```
Navegación con **Tabs** (`expo-router` Tabs) — natural para una app de gestión con
varias secciones de igual jerarquía.

### Lógica de cobro COMPARTIDA (crítico)
`calcularCobro` y `formatCOP` están hoy en `apps/web/lib/tarifas.ts`. Como es **plata**,
NO se duplica: se extrae a un paquete compartido (`@acueducto/cobros` o similar) que
consumen web y mobile. Una sola fuente de verdad para la fórmula de cobro.

---

## Pasos

### 1. Extraer la lógica de cobro a un paquete compartido — ✅ COMPLETADO (2026-06-11)
Creado `packages/cobros/` (`@acueducto/cobros`) con `calcularCobro`, `formatCOP`, tipos `ValoresTarifa`/`Cobro`. Web (`dashboard/page.tsx`) importa de ahí; `apps/web/lib/tarifas.ts` eliminado. Mobile lo consume en `resumen.tsx`. Workspace linkeado (symlinks OK).

- Crear `packages/cobros/` (o `@acueducto/core`) con `calcularCobro` y `formatCOP`.
- `apps/web/lib/tarifas.ts` pasa a re-exportar desde el paquete (o se importa directo).
- Mobile lo importa igual. Cero duplicación de la fórmula.

### 2. Routing por rol — ✅ COMPLETADO (2026-06-11)
Helper `apps/mobile/lib/auth.ts` (`getMyRole`, `routeForRole`). Login (`app/index.tsx`) enruta por rol. Grupo `app/(tesorera)/` con Tabs (`_layout.tsx`) + guard admin/super_admin. Registrado en `app/_layout.tsx`. Stubs de suscriptores/medidores/tarifa creados (contenido en pasos 4-6).

- En `app/index.tsx` (login): tras `signInWithPassword`, leer `profiles.role` y
  `router.replace` al destino según la tabla de arriba.
- Guard en `(app)/_layout.tsx` y en el nuevo `(tesorera)/_layout.tsx`: si el rol no
  corresponde a esa zona, redirigir. (UX, no seguridad — la barrera real es RLS.)
- Registrar el grupo `(tesorera)` en `app/_layout.tsx` (RootLayout `Stack`).

### 3. Pantalla Resumen (consulta) — ✅ COMPLETADO (2026-06-11)
`app/(tesorera)/resumen.tsx`: selector de mes (‹ ›), tarjetas (lecturas/sin lectura/recaudo), alerta de medidores sin lectura, lista por suscriptor con cobros (usa `@acueducto/cobros`). Online, fetch directo a Supabase, pull-to-refresh.

Port mobile del dashboard web: por mes (selector), resumen de consumos por suscriptor
con cobros calculados (usando el paquete del paso 1), recaudo estimado, medidores sin
lectura. Online: fetch directo a Supabase (mismas queries que `apps/web/app/dashboard/page.tsx`).

### 4. CRUD de suscriptores — ✅ COMPLETADO (2026-06-12)
Carpeta `(tesorera)/suscriptores/` (lista + form crear/editar + soft-delete vía `activo`). Trigger `set_organizacion_id` resuelve el org. Verificado por el usuario (alta/edición/inactivar).

- `suscriptores/index.tsx`: lista (FlatList + search) con fetch a Supabase.
- `suscriptores/[id].tsx`: form crear/editar (nombre, apellido, dirección, teléfono,
  email, activo) + borrar. RLS ya permite a `admin` escribir en su org. `organizacion_id`
  se setea desde `get_my_org()` del lado servidor — NO mandar org manual; al insertar,
  setear `organizacion_id` con el de la sesión (o dejar que un default/trigger lo ponga;
  verificar que el insert incluya organizacion_id, que es NOT NULL).
- ⚠️ Nota: `suscriptores.organizacion_id` es NOT NULL y no tiene default. El insert
  desde la app debe incluirlo explícitamente (= el org del usuario). Decidir si se
  agrega un default por trigger o se manda desde el cliente.

### 5. Alta/edición de medidores — ✅ COMPLETADO (2026-06-12)
Carpeta `(tesorera)/medidores/` (lista con join suscriptor + form con selector de suscriptor por Modal + soft-delete). Verificado por el usuario.

- `medidores/index.tsx`: lista + search.
- `medidores/[id].tsx`: alta/editar (numero_serie, suscriptor asignado, sector,
  fecha_instalacion, activo). Mismo tema de `organizacion_id` NOT NULL que el paso 4.

### 6. Ver/cambiar tarifa — ✅ COMPLETADO (2026-06-12)
`(tesorera)/tarifa.tsx`: muestra la vigente + form para cargar nueva (INSERT que preserva histórico, con confirmación). Verificado por el usuario (le faltan mejoras menores, a futuro).

- `tarifa.tsx`: muestra la tarifa vigente y permite cargar una nueva (inserta en
  `tarifas` con `vigente_desde`). El histórico se preserva (no se edita la vieja).

### 7. Activar el guard "solo super_admin" en el dashboard web — ✅ COMPLETADO (2026-06-12)
`apps/web/app/dashboard/layout.tsx`: lee `profiles.role`; si no es `super_admin`, muestra "Acceso restringido" + cerrar sesión (no redirect en loop). Cierra el paso 5 del plan de roles. PENDIENTE: verificación del usuario (super_admin entra / tesorera ve restricción).

**Cierra la dependencia de secuencia del plan de roles (paso 5).** Recién ahora que
la tesorera tiene su zona mobile, se puede restringir el web a `super_admin` sin
dejarla sin interfaz. Editar `apps/web/app/dashboard/layout.tsx` para redirigir a
quien no sea `super_admin`.

### 8. Verificación end-to-end
- Login operario → sigue yendo a sus medidores (sin regresión).
- Login tesorera → entra a su zona; ve consumos/cobros; da de alta un medidor, edita
  un suscriptor, cambia la tarifa; los cambios se reflejan.
- Confirmar que el cobro calculado en mobile == el del web (misma fórmula, paso 1).
- Login super_admin en web → entra; otros roles → redirigidos (paso 7).

---

## Fuera de alcance (a propósito)
- Offline-first para la tesorera (es online).
- Registro de pagos/cobranza (tabla `pagos` + RLS + UI) — fase futura.
- Portal del vecino (`role = 'vecino'`).
- Branding/temas por organización.

---

## Decisiones abiertas (validar antes de ejecutar)
1. **Paso 1**: nombre del paquete compartido — `@acueducto/cobros`, `@acueducto/core`,
   ¿otro?
2. **Pasos 4-5**: `organizacion_id` es NOT NULL sin default en `suscriptores`/`medidores`.
   ¿Lo mandamos desde el cliente (el org de la sesión) o agregamos un trigger
   `before insert` que lo complete con `get_my_org()`? (El trigger es más a prueba de
   olvidos y centraliza la regla; recomendado.)
3. **Orden de construcción**: ¿hacemos los pasos 1-3 primero (routing + resumen, que
   es lo que la tesorera más usa) y dejamos el CRUD (4-6) para una segunda tanda, o
   va todo de una?
