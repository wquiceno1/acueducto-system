# Plan: pulido de UX + elementos pendientes (zona tesorera mobile)

## Contexto

La zona de la tesorera (mobile) y el dashboard web están funcionalmente completos,
pero quedaron asperezas de UX y decisiones a medias que conviene cerrar antes de
seguir con features grandes. Este plan agrupa el pulido en gaps **reales**
detectados durante la construcción, no en mejoras hipotéticas.

Stack: Expo SDK 54, RN 0.81, expo-router 6, estilos `StyleSheet`. Online (sin SQLite
en la zona tesorera). Lógica de cobro en `@acueducto/cobros`.

---

## Áreas de pulido

### 1. Decisión de fondo: soft-delete vs borrado físico (resolver PRIMERO)
Hoy "borrar" un suscriptor/medidor es desactivarlo (`activo = false`). Es lo correcto
para datos con histórico (FKs `ON DELETE RESTRICT` + se preserva el pasado de cobros).
- **Definir**: ¿se mantiene solo soft-delete, o se agrega borrado físico para casos
  "cargué mal algo sin datos asociados"? Si se agrega: policy `DELETE` en RLS +
  confirmación fuerte + manejo del error de FK cuando sí tiene datos.
- Esta decisión condiciona el punto 2 (filtros) y 5 (confirmaciones).

### 2. Filtro activos / inactivos en las listas
Las listas de suscriptores y medidores hoy muestran **todos mezclados** (activos e
inactivos). Pulido:
- Por defecto mostrar solo **activos**.
- Toggle "Ver inactivos" para incluirlos cuando haga falta.
- Esto vuelve el soft-delete realmente útil (hoy un inactivo sigue apareciendo).

### 3. Pantalla Tarifa — "le faltan cosas"
Hoy muestra solo la vigente + cargar nueva. Mejoras propuestas (a confirmar qué tenías
en mente):
- **Histórico de tarifas**: listar las tarifas pasadas con su `vigente_desde` (hoy se
  guardan pero no se ven). Da trazabilidad de "cuánto se cobraba antes".
- **`vigente_desde` editable**: hoy la nueva tarifa rige siempre desde hoy; permitir
  elegir desde cuándo (con validación de que no sea anterior a la vigente actual).
- **Preview del impacto** (opcional): mostrar un ejemplo "un consumo de X m³ pasaría de
  $A a $B" antes de confirmar.

### 4. Date picker para fechas
La fecha de instalación del medidor quedó como `TextInput` de texto (`AAAA-MM-DD`),
frágil y feo. Pulido:
- Instalar `@react-native-community/datetimepicker` (vía `expo install`, compatible con
  Expo Go SDK 54).
- Usarlo en `medidores/[id].tsx` (fecha de instalación) y, si se hace el punto 3,
  en `tarifa.tsx` (`vigente_desde`).

### 5. Feedback de UX (transversal)
Detalles que hacen sentir la app "terminada":
- **Confirmación al guardar**: hoy guardar hace `router.back()` sin aviso. Agregar un
  toast/confirmación corta ("Guardado").
- **Errores amigables**: hoy un error de Postgres se muestra crudo. Caso típico: número
  de serie de medidor duplicado (constraint UNIQUE) → traducir a "Ya existe un medidor
  con ese número de serie".
- **Confirmación al desactivar**: pedir confirmación antes de inactivar un suscriptor/
  medidor (hoy es un switch silencioso).

### 6. Validaciones de formulario
- Suscriptor: validar formato de email (hoy entra cualquier texto).
- Medidor: ya valida serie y suscriptor obligatorios (OK).
- Tarifa: ya valida números ≥ 0 (OK).

### 7. Detalles menores (si sobra)
- Íconos de las tabs: hoy son emojis. Evaluar `@expo/vector-icons` (viene con Expo) para
  íconos consistentes.
- Formato del mes en Resumen y fechas en general.

---

## Orden de trabajo propuesto (por valor/esfuerzo)

1. **Decisión soft-delete** (punto 1) — destraba el resto, cero código.
2. **Tanda rápida de alto valor**: filtro activos/inactivos (2) + feedback al guardar y
   errores amigables (5) + validación email (6). Bajo esfuerzo, se nota mucho.
3. **Date picker** (4) — requiere dep nueva, mejora formularios.
4. **Pantalla Tarifa** (3) — la más sustancial; histórico + vigente_desde editable.
5. **Detalles menores** (7) — si queda tiempo/ganas.

---

## Fuera de alcance (a propósito)
- Cobranza/registro de pagos (es feature, no pulido — su propio plan).
- Storage de fotos de medidores en Supabase (feature).
- Build distribuible / APK de producción (operación, no UX).
- Portal del vecino.

---

## Decisiones abiertas (confirmar antes de ejecutar)
1. **Punto 1**: ¿solo soft-delete, o agregamos borrado físico para casos sin datos?
2. **Punto 3**: ¿qué le faltaba puntualmente a Tarifa según vos? (propongo histórico +
   `vigente_desde` editable; confirmá si era eso u otra cosa).
3. **Orden**: ¿arrancamos por la tanda rápida (punto 2 del orden) que se nota enseguida,
   o preferís atacar primero la pantalla de Tarifa?
