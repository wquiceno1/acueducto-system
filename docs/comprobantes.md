# Plan: Comprobantes en PDF (factura del mes + comprobante de pago)

## Contexto

La cobranza ya funciona (cargos congelados, pagos, saldos), pero **el suscriptor no se
queda con ningún documento**: la tesorera calcula y registra, pero no hay comprobante para
entregar. Este plan agrega la emisión de comprobantes en PDF, compartibles por WhatsApp.

La pantalla de cuenta corriente `apps/mobile/app/(tesorera)/cobranza/[id].tsx` ya carga
casi todos los datos que necesita la factura: suscriptor, cargos, pagos, saldo y el desglose
por medidor (`calcularCobro`). No arrancamos de cero.

Dos hallazgos de la lectura del código que impactan el plan:
1. La tarifa que carga esa pantalla es la **última vigente**, no la del período facturado.
   Para que la factura cuadre con el cargo congelado, el desglose debe usar la **tarifa del
   período** (igual que hace el RPC `generar_cargos_mes`).
2. **No se carga la organización** (nombre del acueducto). El comprobante necesita ese
   encabezado, así que hay que sumar esa query.

## Decisiones tomadas
- **Ambos** documentos: factura del mes + comprobante de pago.
- **Mobile**, compartir por WhatsApp → `expo-print` + `expo-sharing`.
- **PDF** como formato de salida.
- **Folio consecutivo por organización**, persistido en la base.
- **Series separadas**: factura y pago llevan cada uno su propio consecutivo
  (factura N°1, 2, 3…; pago N°1, 2, 3…). Es lo contablemente correcto.

---

## FASE 0 — Modelo de datos y folio (server / Supabase)  ← la más delicada

El folio consecutivo exige rigor: único, sin huecos y a prueba de concurrencia. Eso NO se
resuelve en el cliente.

1. **Tabla `comprobantes`**: `id`, `organizacion_id` (trigger `set_organizacion_id`),
   `tipo` ('factura' | 'pago'), `folio int`, `referencia_id` (el `cargo_id` o el `pago_id`),
   `suscriptor_id`, `total`, `emitido_por`, `emitido_at`.
   - `UNIQUE (organizacion_id, tipo, folio)` → no se repite el número.
   - `UNIQUE (organizacion_id, tipo, referencia_id)` → **idempotencia**: re-compartir una
     factura NO quema un folio nuevo.
2. **Tabla contador** `comprobante_consecutivos (organizacion_id, tipo, ultimo_folio)` para
   asignar el número atómicamente. RLS sin políticas: solo la toca el RPC (security definer).
3. **RPC `emitir_comprobante(tipo, referencia_id)`** (`security definer`, chequeo de rol
   admin/super_admin):
   - Idempotente: si ya existe el comprobante de esa referencia, devuelve el folio existente.
   - Toma `suscriptor_id` y `total` **de la referencia** (cargo o pago), no del cliente.
   - Asigna el folio atómicamente (incremento del contador vía `on conflict do update`).
   - Maneja la carrera concurrente con bloque `exception unique_violation` → sin huecos.
4. **RLS** en `comprobantes`: `select` por organización (`can_access_org` + admin/super_admin);
   sin política de `insert` → solo entra por el RPC.
5. **Tipo `Comprobante`** en `packages/types`.

## FASE 1 — Ensamblado de datos del comprobante (client, lógica pura)

6. Función que arma los datos de la **factura** de un cargo: suscriptor, organización, período,
   consumo, **desglose con la tarifa del período** (no la última), total = `cargo.monto`
   (autoridad), saldo. Reusa `@acueducto/cobros`.
7. Función que arma los datos del **comprobante de pago**: pago (monto, fecha, método) + saldo.
8. Estas funciones son puras → **testeables** (en línea con la suite de `@acueducto/cobros`).

## FASE 2 — Plantilla HTML + generación de PDF

9. `npx expo install expo-print expo-sharing`.
10. `lib/comprobante.ts`: plantillas HTML (factura y pago) con encabezado del acueducto, folio
    y datos → `Print.printToFileAsync(html)` → `Sharing.shareAsync(uri)`.

## FASE 3 — UI en cobranza

11. En `cobranza/[id].tsx`: cargar la organización; botón **"Compartir factura"** por cada
    cargo y **"Compartir comprobante"** por cada pago (y ofrecerlo tras registrar un pago).
    Cada botón: RPC → folio → arma datos → genera PDF → comparte.

## FASE 4 — Verificación

12. Tests de las funciones de ensamblado (Fase 1).
13. Manual en dispositivo: generar, compartir por WhatsApp, **re-compartir** (mismo folio),
    folio que avanza entre suscriptores.

---

## A cuidar / riesgos
- **Concurrencia del folio**: se asigna en el RPC con incremento atómico; nunca en el cliente.
- **Factura vs cargo congelado**: el total siempre es `cargo.monto`; el desglose se recalcula
  con la tarifa del período para que cuadre.
- **Requiere conexión**: el folio es server-side, así que emitir comprobante necesita red
  (aceptable para la tesorera).
- **`expo-print` en Expo Go**: es módulo del SDK, debería andar en Expo Go SDK 54 — verificar
  al instalar.

## Fuera de alcance
- Portal del vecino (el vecino descargando su propio comprobante) — es otra función.
- Factura electrónica DIAN / resolución legal: esto es una "cuenta de cobro" comunitaria.
- Envío automático por WhatsApp/API: la tesorera comparte manual desde el share sheet.

## Orden sugerido
1. Fase 0 completa (la base y el folio son el corazón y lo más riesgoso).
2. Fase 1 (lógica de ensamblado, testeable).
3. Fase 2 (PDF) y Fase 3 (UI).
4. Fase 4 verificación en dispositivo.
