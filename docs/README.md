# Documentación de decisiones — Acueducto

Planes de trabajo y decisiones de arquitectura del proyecto, en orden cronológico.
Cada documento registra el **contexto, las decisiones y el "por qué"** detrás de cada
cambio grande — no solo qué se hizo, sino por qué se hizo así.

## Planes

1. **[Multi-tenant](multi-tenant.md)** — Preparar el schema para soportar varias
   comunidades (organizaciones, tarifas por organización, roles + RLS) sin sobre-construir
   aparato SaaS. _Estado: implementado._

2. **[Rol super_admin](roles-super-admin.md)** — Separar un rol "admin ultra"
   (cross-comunidad, dueño del sistema) del `admin` de cada comunidad (la tesorera).
   Incluye el cierre del agujero del trigger de auto-asignación de rol. _Estado: implementado._

3. **[Zona tesorera en mobile](tesorera-mobile.md)** — Llevar la gestión de la tesorera
   a la app (routing por rol, paquete de cobros compartido, Resumen + CRUD de
   suscriptores/medidores/tarifa). _Estado: implementado._

4. **[Pulido de UX](pulido-ux.md)** — Filtro de activos/inactivos, feedback al guardar,
   errores amigables, validaciones, histórico de tarifa, date picker. _Estado: implementado._

5. **[Módulo de cobranza](modulo-cobranza.md)** — Cuenta corriente con cargos congelados:
   generación de cargos por mes (con la tarifa del período), pagos, saldos y morosos.
   _Estado: implementado y verificado (prueba de fuego del cambio de tarifa OK)._

6. **[Persistencia de sesión + biometría](persistencia-sesion-biometria.md)** — Que la
   sesión sobreviva al cierre de la app (Fase 1) y login con huella en Android (Fase 2).
   _Estado: Fase 1 implementada y verificada en dispositivo (operario + tesorera);
   Fase 2 (huella) implementada y verificada en dispositivo._

7. **[Comprobantes en PDF](comprobantes.md)** — Emisión de factura del mes y comprobante de
   pago en PDF (compartible por WhatsApp desde mobile), con folio consecutivo por organización.
   _Estado: Fases 0-3 implementadas (datos+folio aplicado, ensamblado testeado, PDF, UI en
   cobranza con botones Compartir factura/comprobante). Pendiente Fase 4: verificar en dispositivo._

---

> Estos documentos son la fuente del "por qué" del proyecto. Al retomar o sumar a alguien
> al equipo, leer estos planes da el contexto de las decisiones de arquitectura.
