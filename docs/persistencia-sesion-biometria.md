# Plan: persistencia de sesión + biometría por huella (Android)

## Contexto

Hoy el cliente Supabase se crea sin storage adapter (`createClient(url, anonKey)`),
así que **la sesión no persiste en mobile**: el operario y la tesorera se loguean con
email/contraseña cada vez que se reabre la app (cuando se mata el proceso). No hay
AsyncStorage ni SecureStore en las dependencias.

Dos fases independientes y secuenciales:
- **Fase 1 (prioridad)**: persistir la sesión → no loguearse cada vez. Alto valor por sí solo.
- **Fase 2 (segundo orden)**: biometría por huella montada sobre la persistencia.

**Alcance: solo Android.** Se ignora iOS (sin Face ID, sin `NSFaceIDUsageDescription`).
Esto simplifica la config nativa: la biometría de Android suele requerir cero config extra.

**Concepto base (vale para las dos fases)**: la huella NO autentica contra Supabase.
Supabase sigue usando el token. La biometría es un **candado local** que desbloquea la
sesión guardada. Por eso persistir la sesión es prerequisito de la huella.

---

## FASE 1 — Persistencia de sesión (prioridad)

### Objetivo
Que al reabrir la app, si hay una sesión válida guardada, el usuario entre directo
(auto-login) sin reescribir email/contraseña.

### Pasos

#### 1. Dependencia de almacenamiento
`npx expo install @react-native-async-storage/async-storage` (compatible con Expo Go SDK 54).

#### 2. Refactor del cliente compartido
`packages/supabase-client/src/index.ts`: `createSupabaseClient` debe aceptar opciones de
auth/storage opcionales. Mobile le pasa el adapter de AsyncStorage.
```ts
import { createClient, SupabaseClient, SupabaseClientOptions } from "@supabase/supabase-js";

export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: SupabaseClientOptions<"public">
): SupabaseClient {
  return createClient(url, anonKey, options);
}
```
- ✅ **Verificado (2026-06-17)**: el **único** consumidor de `createSupabaseClient` es
  `apps/mobile/lib/supabase.ts`. El web NO usa el cliente compartido para esto: crea su
  cliente con `createClient` directo de `@supabase/supabase-js` en `apps/web/lib/supabase.ts`.
  Por lo tanto este refactor **no puede romper el web** — el riesgo está acotado a mobile.
- Conservar el tipo de retorno `SupabaseClient` y tipar el tercer parámetro con
  `SupabaseClientOptions` (no tirar los tipos al agregar el parámetro).

#### 3. Configurar persistencia en mobile
`apps/mobile/lib/supabase.ts`: pasar el storage y las flags de auth:
```ts
auth: {
  storage: AsyncStorage,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
}
```

#### 4. Auto-login al arrancar
`apps/mobile/app/index.tsx` (login): al montar, hacer `getSession()`. Si hay sesión válida,
leer el rol (`getMyRole`) y `router.replace` al destino (`routeForRole`) sin mostrar el
formulario. Si no hay sesión, mostrar el login como hoy.
- **Reusar lo existente**: `getMyRole` y `routeForRole` ya están en `apps/mobile/lib/auth.ts`
  y los usa el login actual. El auto-login solo necesita rutear; NO duplicar lógica de guard.
- **Guards ya existen**: `app/(app)/_layout.tsx` y `app/(tesorera)/_layout.tsx` ya defienden
  cada zona con `getSession()` + `onAuthStateChange` (`SIGNED_OUT → router.replace("/")`).
  El auto-login se apoya en esa infraestructura, no la reemplaza.
- **Estado "verificando" (spec)**: agregar un loading state real en `index.tsx` mientras corre
  `getSession()` — renderizar un spinner/pantalla neutra, NO el formulario, hasta resolver.
  Así no parpadea el form cuando sí hay sesión.

#### 5. (Recomendado) Auto-refresh del token según AppState
Patrón oficial de Supabase RN: `supabase.auth.startAutoRefresh()` cuando la app está
activa y `stopAutoRefresh()` en background (vía `AppState`). Evita tokens vencidos en
sesiones largas.
- **Dónde (spec)**: el patrón oficial registra el listener de `AppState` a **nivel de módulo**
  en `apps/mobile/lib/supabase.ts` (junto a la creación del cliente), no dentro de un componente.

#### 6. Verificación
Login → matar el proceso de la app → reabrir → entra directo, sin pedir credenciales.
Logout (botón Salir) → al reabrir, vuelve a pedir login.
- **El logout ya funciona, solo verificarlo**: los botones Salir de `app/(app)/_layout.tsx` y
  `app/(tesorera)/_layout.tsx` ya hacen `signOut()` + `router.replace("/")`. Con
  `persistSession: true`, `signOut()` **limpia el AsyncStorage automáticamente** (lo hace el
  storage adapter) — no hay que implementar limpieza manual en Fase 1, solo confirmar que
  al reabrir tras logout vuelve a pedir login.

### Decisión abierta (Fase 1)
**¿AsyncStorage o SecureStore para guardar la sesión?**
- **AsyncStorage** (recomendado para empezar): es el adapter oficial que documenta
  Supabase para RN. En Android el storage está aislado por app (sandbox). Simple.
- **SecureStore (cifrado)**: más seguro, pero tiene límite de ~2048 bytes por valor y la
  sesión de Supabase puede excederlo → requiere un patrón "LargeSecureStore" (cifrar con
  una clave en SecureStore + guardar el blob en AsyncStorage). Más trabajo.
- Recomendación: AsyncStorage en Fase 1; si se quiere cifrado fuerte, se aborda junto con
  la Fase 2 (donde la clave puede quedar detrás de la huella).

---

## FASE 2 — Biometría por huella (segundo orden, Android)

### Objetivo
Que, con la sesión ya persistida, el ingreso pida la **huella** en vez de entrar directo,
como capa de protección ante uso no autorizado del dispositivo.

### Pasos

#### 1. Dependencia
`npx expo install expo-local-authentication` (módulo del SDK, anda en Expo Go; en Android
no necesita config de permisos extra para probar).

#### 2. Activación (opt-in tras el primer login)
Tras un login con contraseña exitoso, si el dispositivo tiene huella disponible
(`hasHardwareAsync()` && `isEnrolledAsync()`), ofrecer "Activar ingreso con huella" y
guardar un flag (`biometria_on`) en AsyncStorage.

#### 3. Pantalla de desbloqueo al arrancar
Al abrir la app, si hay sesión persistida **y** `biometria_on`:
- Mostrar pantalla "Ingresá con tu huella" en vez del auto-login directo.
- `LocalAuthentication.authenticateAsync({ promptMessage: "Ingresá con tu huella" })`.
- Éxito → enrutar por rol. Falla/cancela → botón "Usar contraseña" (mostrar login).

#### 4. Casos borde (Android)
- Sin lector de huella o sin huella enrolada → no ofrecer biometría; comportamiento de
  Fase 1 (auto-login o login).
- Falla/cancelación de la huella → fallback a contraseña, sin trabar al usuario.

#### 5. Logout
El botón Salir debe limpiar el flag `biometria_on` y la sesión (`signOut` ya borra la
sesión persistida), para que no quede el gate apuntando a una sesión cerrada.

#### 6. Nivel de seguridad (a decidir)
- **Gate simple (recomendado para el caso)**: la sesión vive en AsyncStorage (sandbox por
  app) y la huella controla el *acceso a la app*. Protege del uso casual no autorizado;
  no es cifrado fuerte (alguien con root podría leer el storage).
- **Cifrado fuerte (avanzado, opcional)**: cifrar la sesión con una clave en SecureStore
  que solo se libera con la huella. Más robusto, bastante más trabajo. Probablemente
  innecesario para un acueducto comunitario.

---

## Fuera de alcance
- iOS / Face ID (descartado por pedido).
- Cifrado fuerte de la sesión (nivel avanzado) salvo que se pida.
- PIN/patrón como alternativa a la huella.
- Multi-cuenta en un mismo dispositivo (cada rol usa su propio celular).

## Riesgos / cosas a cuidar
- **Opciones opcionales en el cliente compartido**: el tercer parámetro debe ser opcional para
  no obligar a cambiar a ningún consumidor. (Nota: verificado que el web NO consume
  `createSupabaseClient` — usa `createClient` directo —, así que el refactor no afecta al web;
  el único consumidor es mobile.)
- **Seguridad**: nunca guardar la contraseña; persistir la sesión/refresh token, no el password.
- **Limpieza en logout**: en Fase 1 la hace `signOut()` solo (limpia AsyncStorage). En Fase 2
  hay que sumar la limpieza del flag `biometria_on`.
- Probar en un **dispositivo Android real con huella** (el emulador puede simular huella,
  pero conviene validar en hardware).

## Orden sugerido
1. Fase 1 completa y verificada (ya resuelve la molestia de loguearse cada vez).
2. Fase 2 encima, una vez que la persistencia esté sólida.
