import { describe, it, expect } from "vitest";
import {
  calcularCobro,
  saldoSuscriptor,
  estaAlDia,
  formatCOP,
  type ValoresTarifa,
} from "./index";

// Tarifas de prueba. La A es la "vieja"; la B simula un cambio de tarifa posterior.
const TARIFA_A: ValoresTarifa = {
  cargo_fijo: 5000,
  consumo_base_m3: 15,
  precio_excedente_m3: 1000,
};
const TARIFA_B: ValoresTarifa = {
  cargo_fijo: 8000,
  consumo_base_m3: 10,
  precio_excedente_m3: 1500,
};

// ─────────────────────────────────────────────────────────────────────────────
// CU1 — Cálculo del cobro mensual (calcularCobro)
// Regla: total = cargo fijo + (m³ por encima de la base) × precio excedente.
// El excedente nunca puede ser negativo.
// ─────────────────────────────────────────────────────────────────────────────
describe("CU1: calcularCobro — cobro mensual de un suscriptor", () => {
  it("consumo por debajo de la base: solo cobra el cargo fijo, sin excedente", () => {
    const cobro = calcularCobro(10, TARIFA_A); // 10 < 15
    expect(cobro).toEqual({ cargoFijo: 5000, excedente: 0, total: 5000 });
  });

  it("consumo EXACTO en la base: borde sin excedente", () => {
    const cobro = calcularCobro(15, TARIFA_A); // 15 == base
    expect(cobro.excedente).toBe(0);
    expect(cobro.total).toBe(5000);
  });

  it("consumo por encima de la base: cobra fijo + excedente proporcional", () => {
    const cobro = calcularCobro(20, TARIFA_A); // (20-15)=5 m³ × 1000
    expect(cobro).toEqual({ cargoFijo: 5000, excedente: 5000, total: 10000 });
  });

  it("consumo cero: igual cobra el cargo fijo (servicio disponible)", () => {
    const cobro = calcularCobro(0, TARIFA_A);
    expect(cobro.total).toBe(5000);
  });

  it("consumo negativo (lectura corregida/error): no genera excedente negativo", () => {
    const cobro = calcularCobro(-5, TARIFA_A);
    expect(cobro.excedente).toBe(0);
    expect(cobro.total).toBe(5000);
  });

  it("propiedad: total siempre es cargoFijo + excedente", () => {
    for (const consumo of [0, 5, 15, 30, 100]) {
      const c = calcularCobro(consumo, TARIFA_B);
      expect(c.total).toBe(c.cargoFijo + c.excedente);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CU2 — Saldo de la cuenta corriente (saldoSuscriptor)
// Regla: saldo = Σ cargos − Σ pagos. Positivo = debe; ≤ 0 = al día/a favor.
// ─────────────────────────────────────────────────────────────────────────────
describe("CU2: saldoSuscriptor — cuenta corriente", () => {
  it("sin cargos ni pagos: saldo en cero", () => {
    expect(saldoSuscriptor([], [])).toBe(0);
  });

  it("cargos sin pagos: el suscriptor debe la suma de los cargos", () => {
    const saldo = saldoSuscriptor([{ monto: 10000 }, { monto: 23000 }], []);
    expect(saldo).toBe(33000);
  });

  it("pagos que igualan los cargos: saldo cero (al día exacto)", () => {
    const saldo = saldoSuscriptor([{ monto: 10000 }], [{ monto: 10000 }]);
    expect(saldo).toBe(0);
  });

  it("pagos que superan los cargos: saldo a favor (negativo)", () => {
    const saldo = saldoSuscriptor([{ monto: 10000 }], [{ monto: 15000 }]);
    expect(saldo).toBe(-5000);
  });

  it("varios cargos y varios pagos: suma neta correcta", () => {
    const saldo = saldoSuscriptor(
      [{ monto: 10000 }, { monto: 8000 }, { monto: 12000 }],
      [{ monto: 5000 }, { monto: 5000 }]
    );
    expect(saldo).toBe(20000); // 30000 - 10000
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CU3 — Estado de morosidad (estaAlDia)
// Regla: está al día si el saldo es ≤ 0.
// ─────────────────────────────────────────────────────────────────────────────
describe("CU3: estaAlDia — morosidad", () => {
  it("saldo positivo: moroso", () => {
    expect(estaAlDia(5000)).toBe(false);
  });

  it("saldo cero: al día (borde)", () => {
    expect(estaAlDia(0)).toBe(true);
  });

  it("saldo a favor (negativo): al día", () => {
    expect(estaAlDia(-3000)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CU4 — Formato de moneda (formatCOP)
// Regla: pesos colombianos, separador de miles, SIN decimales.
// ─────────────────────────────────────────────────────────────────────────────
describe("CU4: formatCOP — formato de moneda", () => {
  // Intl usa NBSP / narrow-NBSP; \s los cubre. Normalizamos para no ser frágiles.
  const norm = (s: string) => s.replace(/\s/g, " ");

  it("incluye el símbolo de peso", () => {
    expect(norm(formatCOP(1000))).toContain("$");
  });

  it("usa el punto como separador de miles", () => {
    expect(norm(formatCOP(1000))).toContain("1.000");
    expect(norm(formatCOP(1500000))).toContain("1.500.000");
  });

  it("no muestra decimales", () => {
    // No debe aparecer un patrón "1.000,00" (coma + dos decimales).
    expect(norm(formatCOP(1000))).not.toMatch(/,\d{2}/);
  });

  it("formatea el cero", () => {
    expect(norm(formatCOP(0))).toContain("0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CU5 (integración) — Prueba de fuego: cambio de tarifa con cargos congelados.
// Un Cargo es un snapshot del monto del mes. Si la tarifa cambia DESPUÉS, los
// cargos viejos NO se recalculan: conservan el monto con el que se generaron.
// ─────────────────────────────────────────────────────────────────────────────
describe("CU5: cargo congelado ante cambio de tarifa", () => {
  it("un cargo viejo conserva su monto aunque cambie la tarifa", () => {
    const consumo = 20;

    // Mes 1: se genera el cargo con la tarifa A vigente en ese momento.
    const cobroMes1 = calcularCobro(consumo, TARIFA_A); // total 10000
    const cargoMes1 = { monto: cobroMes1.total }; // ← snapshot congelado

    // La comunidad aprueba una tarifa nueva (B), más cara.
    // Mes 2: el cargo se genera con la tarifa B.
    const cobroMes2 = calcularCobro(consumo, TARIFA_B); // total 23000
    const cargoMes2 = { monto: cobroMes2.total };

    // El cargo del mes 1 sigue valiendo lo de la tarifa A, NO lo que valdría hoy con B.
    expect(cargoMes1.monto).toBe(10000);
    expect(calcularCobro(consumo, TARIFA_B).total).toBe(23000);
    expect(cargoMes1.monto).not.toBe(calcularCobro(consumo, TARIFA_B).total);

    // El saldo usa los montos CONGELADOS, no un recálculo con la tarifa actual.
    const saldo = saldoSuscriptor([cargoMes1, cargoMes2], []);
    expect(saldo).toBe(33000); // 10000 (congelado A) + 23000 (B)
  });

  it("un pago se aplica al saldo total de cuenta corriente, no a un cargo puntual", () => {
    const cargos = [{ monto: 10000 }, { monto: 23000 }]; // saldo 33000
    const pagos = [{ monto: 10000 }];
    const saldo = saldoSuscriptor(cargos, pagos);
    expect(saldo).toBe(23000);
    expect(estaAlDia(saldo)).toBe(false); // todavía debe
  });
});
