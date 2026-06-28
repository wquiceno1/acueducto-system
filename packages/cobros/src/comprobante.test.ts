import { describe, it, expect } from "vitest";
import {
  formatPeriodo,
  construirFactura,
  construirComprobantePago,
  type ValoresTarifa,
} from "./index";

const TARIFA: ValoresTarifa = {
  cargo_fijo: 5000,
  consumo_base_m3: 15,
  precio_excedente_m3: 1000,
};

// ─────────────────────────────────────────────────────────────────────────────
// CU6 — Etiqueta de período (formatPeriodo)
// ─────────────────────────────────────────────────────────────────────────────
describe("CU6: formatPeriodo — fecha del cargo a etiqueta legible", () => {
  it("convierte el primer día del mes en 'Mes Año'", () => {
    expect(formatPeriodo("2026-06-01")).toBe("Junio 2026");
    expect(formatPeriodo("2026-01-01")).toBe("Enero 2026");
    expect(formatPeriodo("2025-12-01")).toBe("Diciembre 2025");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CU7 — Armado de la factura del mes (construirFactura)
// ─────────────────────────────────────────────────────────────────────────────
describe("CU7: construirFactura — datos de la factura del mes", () => {
  const base = {
    folio: 1,
    organizacion: "Acueducto Santa Bárbara",
    suscriptor: "Pérez, Juan",
    periodo: "2026-06-01",
    saldoCuenta: 0,
    emitidoEn: "2026-06-17",
  };

  it("un medidor: desglose = un cargo fijo + su excedente", () => {
    const f = construirFactura({
      ...base,
      lineas: [{ numeroSerie: "A1", consumo: 20 }], // 5000 + (20-15)*1000
      tarifa: TARIFA,
      totalCongelado: 10000,
    });
    expect(f.consumoTotal).toBe(20);
    expect(f.subtotalCargoFijo).toBe(5000);
    expect(f.subtotalExcedente).toBe(5000);
    expect(f.total).toBe(10000);
    expect(f.periodo).toBe("Junio 2026");
    expect(f.lineas).toHaveLength(1);
  });

  it("VARIOS medidores: el cargo fijo se cobra POR medidor (no una sola vez)", () => {
    const f = construirFactura({
      ...base,
      lineas: [
        { numeroSerie: "A1", consumo: 20 }, // 5000 + 5000
        { numeroSerie: "A2", consumo: 10 }, // 5000 + 0
      ],
      tarifa: TARIFA,
      totalCongelado: 15000,
    });
    expect(f.consumoTotal).toBe(30);
    expect(f.subtotalCargoFijo).toBe(10000); // 2 × 5000 ← la clave
    expect(f.subtotalExcedente).toBe(5000);
    expect(f.total).toBe(15000);
  });

  it("el total SIEMPRE es el monto congelado, no la suma recalculada", () => {
    const f = construirFactura({
      ...base,
      lineas: [{ numeroSerie: "A1", consumo: 20 }], // recalculado daría 10000
      tarifa: TARIFA,
      totalCongelado: 9000, // monto congelado distinto (p. ej. tarifa de otro período)
    });
    expect(f.total).toBe(9000); // manda el congelado
    expect(f.subtotalCargoFijo + f.subtotalExcedente).toBe(10000); // el desglose es informativo
  });

  it("sin lecturas: factura en cero (solo lo que diga el monto congelado)", () => {
    const f = construirFactura({
      ...base,
      lineas: [],
      tarifa: TARIFA,
      totalCongelado: 0,
    });
    expect(f.consumoTotal).toBe(0);
    expect(f.subtotalCargoFijo).toBe(0);
    expect(f.lineas).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CU8 — Armado del comprobante de pago (construirComprobantePago)
// ─────────────────────────────────────────────────────────────────────────────
describe("CU8: construirComprobantePago — datos del comprobante de pago", () => {
  const base = {
    folio: 42,
    organizacion: "Acueducto Santa Bárbara",
    suscriptor: "Pérez, Juan",
    emitidoEn: "2026-06-17",
  };

  it("mapea los datos del pago y calcula el saldo restante (al día)", () => {
    const c = construirComprobantePago({
      ...base,
      pago: { monto: 15000, fecha_pago: "2026-06-17", metodo: "efectivo" },
      cargos: [{ monto: 10000 }, { monto: 5000 }],
      pagos: [{ monto: 15000 }],
    });
    expect(c.montoPagado).toBe(15000);
    expect(c.fechaPago).toBe("2026-06-17");
    expect(c.metodo).toBe("efectivo");
    expect(c.saldoRestante).toBe(0);
    expect(c.folio).toBe(42);
  });

  it("pago parcial: queda saldo restante por cobrar", () => {
    const c = construirComprobantePago({
      ...base,
      pago: { monto: 10000, fecha_pago: "2026-06-17", metodo: "transferencia" },
      cargos: [{ monto: 10000 }, { monto: 23000 }], // debe 33000
      pagos: [{ monto: 10000 }],
    });
    expect(c.saldoRestante).toBe(23000);
    expect(c.metodo).toBe("transferencia");
  });
});
