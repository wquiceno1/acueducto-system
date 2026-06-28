import type { Tarifa, Cargo, Pago } from "@acueducto/types";

// Lógica de cobro COMPARTIDA entre web y mobile. Es plata: una sola fuente de
// verdad para la fórmula, para que el cálculo nunca difiera entre frontends.

// Subconjunto de Tarifa con los valores que entran en el cálculo.
export type ValoresTarifa = Pick<
  Tarifa,
  "cargo_fijo" | "consumo_base_m3" | "precio_excedente_m3"
>;

export interface Cobro {
  cargoFijo: number;
  excedente: number;
  total: number;
}

export function calcularCobro(consumoM3: number, tarifa: ValoresTarifa): Cobro {
  const cargoFijo = tarifa.cargo_fijo;
  const excedenteM3 = Math.max(0, consumoM3 - tarifa.consumo_base_m3);
  const excedente = excedenteM3 * tarifa.precio_excedente_m3;
  return { cargoFijo, excedente, total: cargoFijo + excedente };
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value);
}

// --- Cobranza (cuenta corriente) ---
// Saldo del suscriptor = Σ cargos − Σ pagos. Positivo = debe; <= 0 = al día.
export function saldoSuscriptor(
  cargos: Pick<Cargo, "monto">[],
  pagos: Pick<Pago, "monto">[]
): number {
  const totalCargos = cargos.reduce((s, c) => s + c.monto, 0);
  const totalPagos = pagos.reduce((s, p) => s + p.monto, 0);
  return totalCargos - totalPagos;
}

export function estaAlDia(saldo: number): boolean {
  return saldo <= 0;
}

// Ensamblado de datos de comprobantes (factura del mes / comprobante de pago).
export * from "./comprobante";
