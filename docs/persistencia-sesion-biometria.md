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

#### 2. Refactor del cliente compartido (sin romper el web)
`packages/supabase-client/src/index.ts`: `createSupabaseClient` debe aceptar opciones de
auth/storage opcionales. El web sigue llamándolo sin storage (usa su default de browser);
mobile le pasa el adapter de AsyncStorage.
```ts
export function createSupabaseClient(url, anonKey, options?) {
  return createClient(url, anonKey, options);
}
```
- ⚠️ Verificar que `apps/web/lib/supabase.ts` (que llama `createSupabaseClient(url, key)`)
  siga funcionando igual (las opciones son opcionales).

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
leer el rol y `router.replace` al destino (operario/tesorera) sin mostrar el formulario.
Si no hay sesión, mostrar el login como hoy. (Estado intermedio "verificando" para no
parpadear el formulario.)

#### 5. (Recomendado) Auto-refresh del token según AppState
Patrón oficial de Supabase RN: `supabase.auth.startAutoRefresh()` cuando la app está
activa y `stopAutoRefresh()` en background (vía `AppState`). Evita tokens vencidos en
sesiones largas.

#### 6. Verificación
Login → matar el proceso de la app → reabrir → entra directo, sin pedir credenciales.
Logout (botón Salir) → al reabrir, vuelve a pedir login (la sesión se limpió).

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
- **No romper el web** al refactorizar `@acueducto/supabase-client` (las opciones deben
  ser opcionales).
- **Seguridad**: nunca guardar la contraseña; persistir la sesión/refresh token, no el password.
- **Limpieza en logout**: dejar el storage consistente (sesión + flag biometría).
- Probar en un **dispositivo Android real con huella** (el emulador puede simular huella,
  pero conviene validar en hardware).

## Orden sugerido
1. Fase 1 completa y verificada (ya resuelve la molestia de loguearse cada vez).
2. Fase 2 encima, una vez que la persistencia esté sólida.
