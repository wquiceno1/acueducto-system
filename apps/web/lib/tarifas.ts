export const TARIFAS = {
  CARGO_FIJO: 10_000,
  CONSUMO_BASE_M3: 15,
  PRECIO_EXCEDENTE_M3: 1_000,
} as const;

export function calcularCobro(consumoM3: number): {
  cargoFijo: number;
  excedente: number;
  total: number;
} {
  const cargoFijo = TARIFAS.CARGO_FIJO;
  const excedentM3 = Math.max(0, consumoM3 - TARIFAS.CONSUMO_BASE_M3);
  const excedente = excedentM3 * TARIFAS.PRECIO_EXCEDENTE_M3;
  return { cargoFijo, excedente, total: cargoFijo + excedente };
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value);
}
