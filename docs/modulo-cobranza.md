# Plan: módulo de pagos / cobranza (zona tesorera)

## Contexto

El sistema calcula cuánto debe cada suscriptor (consumo × tarifa) pero **no registra
pagos ni deuda**. Este módulo cierra ese ciclo: la tesorera registra pagos, ve saldos
y morosos. Para una tesorera de acueducto, esto es el corazón de su trabajo.

## Decisiones tomadas (2026-06-13)

- **Modelo: cuenta corriente con cargos congelados.** Cada mes se genera un *snapshot*
  fijo de lo que debe cada suscriptor (con la tarifa que regía ESE mes). Los pagos se
  aplican al saldo. Saldo = Σ cargos − Σ pagos. Inmune a cambios de tarifa → deuda
  contablemente correcta.
- **Alcance MVP: features 1-5 (núcleo)** + la generación de cargos (6) que es su base.

### Consecuencia: la generación de cargos entra al núcleo
Sin cargos congelados no hay contra qué medir saldos/morosos/estado de cuenta. Por eso
el MVP real es: **generar cargos → registrar pagos → ver saldos/morosos/estado de cuenta**.

---

## Modelo de datos

```sql
-- cargos: snapshot de lo que debe un suscriptor en un mes (congelado).
create table cargos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  suscriptor_id uuid not null references suscriptores(id),
  periodo date not null,            -- primer día del mes: 2026-06-01
  monto numeric not null,           -- total congelado del mes
  consumo_total numeric,            -- m³ del mes (para el detalle/recibo)
  generado_at timestamptz not null default now(),
  unique (suscriptor_id, periodo)   -- un cargo por suscriptor por mes (idempotente)
);

-- pagos: abonos del suscriptor, aplicados a su saldo (a cuenta, no a un cargo puntual).
create table pagos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  suscriptor_id uuid not null references suscriptores(id),
  monto numeric not null check (monto > 0),
  fecha_pago date not null default current_date,
  metodo text not null default 'efectivo'
    check (metodo in ('efectivo','transferencia','otro')),
  notas text,
  created_at timestamptz not null default now()
);
```
- **RLS**: mismo patrón que el resto — `can_access_org(organizacion_id)` + rol
  `admin`/`super_admin` para escribir; lectura admin/operario (o solo admin) según
  se decida. El operario NO necesita ver pagos.
- **Trigger** `set_organizacion_id` extendido (o triggers nuevos) para `cargos` y `pagos`.
- **Pagos a cuenta** (no atados a un cargo específico): el saldo es uno solo por
  suscriptor. Más simple y natural para una cobranza comunitaria; cubre pago parcial
  sin lógica extra (un pago menor al saldo deja saldo pendiente).

---

## Lógica de saldos (compartida)
En `@acueducto/cobros` (o un paquete nuevo), función pura:
```ts
saldoSuscriptor(cargos: Cargo[], pagos: Pago[]): number  // Σcargos − Σpagos
estaAlDia(saldo): boolean                                 // saldo <= 0
```
Reutilizable web + mobile.

---

## Generación de cargos del mes
Acción que dispara la tesorera ("Generar cargos de [mes]"):
- Por cada suscriptor con lecturas en el período, calcula el monto = Σ
  `calcularCobro(consumo, tarifaDelPeriodo)` sobre sus medidores.
- **Tarifa del período**: la de mayor `vigente_desde <= último día del mes` (NO la
  más reciente). Esto es lo que congela el valor correcto.
- Inserta en `cargos`; el `unique(suscriptor, periodo)` lo hace **idempotente**
  (re-generar no duplica).
- **Dónde corre (decisión abierta)**: recomendado una **función RPC en Postgres**
  (`generar_cargos_mes(periodo)`) — atómica, server-side, usa la tarifa correcta. La
  alternativa (calcular en el cliente mobile) es más simple pero menos robusta para algo
  que es plata.

---

## UI (zona tesorera mobile) — nueva pestaña "Cobranza"
(5ª tab; las 4 actuales son Resumen, Suscriptores, Medidores, Tarifa.)
- **Lista de suscriptores con su saldo**: al día (verde) / debe $X (rojo). Filtro
  "solo morosos". Total adeudado a la comunidad arriba.
- **Detalle de suscriptor** (estado de cuenta): cargos mes a mes, pagos, saldo. Botón
  "Registrar pago".
- **Registrar pago**: monto, fecha (DateField), método (efectivo/transferencia/otro),
  notas. Valida monto > 0.
- **Generar cargos del mes**: acción (selector de mes + botón), con confirmación.

---

## Pasos

### 1. Schema: tablas `cargos` y `pagos`
Migración: las dos tablas + índices (suscriptor_id, periodo) + RLS + triggers de org.

### 2. Tipos
`packages/types`: `Cargo`, `Pago`, `MetodoPago`.

### 3. Lógica de saldos
`saldoSuscriptor` / `estaAlDia` en el paquete compartido.

### 4. Generación de cargos
Función RPC `generar_cargos_mes(periodo)` (o lógica cliente, según decisión) +
selección de tarifa correcta del período.

### 5. UI: lista de saldos + filtro morosos
Pestaña Cobranza con la lista y el total adeudado.

### 6. UI: estado de cuenta + registrar pago
Detalle por suscriptor + formulario de pago.

### 7. Verificación e2e
Generar cargos de un mes → registrar un pago total → saldo a cero; pago parcial →
saldo pendiente; morosos correctos; cambiar tarifa y confirmar que la deuda vieja NO
cambia (la prueba de fuego del modelo).

---

## Fuera de alcance (fases siguientes)
- Comprobante/recibo compartible (WhatsApp/PDF) — feature 9.
- Resumen de recaudación esperado vs recaudado — feature 8 (fácil de sumar después).
- Recordatorios a morosos, intereses por mora, convenios/cuotas.
- Portal del vecino para que vea su propio saldo.

---

## Decisiones cerradas (2026-06-13)
1. **Generación de cargos** → **función RPC en Postgres** (`generar_cargos_mes`), atómica y server-side.
2. **Lectura de pagos/cargos** → **solo `admin`/`super_admin`** (el operario no ve cobranza).
3. **Ubicación UI** → **5ª pestaña "Cobranza"**.
4. **Aplicación de pagos** → **a cuenta** (saldo único por suscriptor), cubre pago parcial sin lógica extra.
