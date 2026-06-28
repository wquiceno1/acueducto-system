import type { Cargo, Pago } from "@acueducto/types";
import {
  calcularCobro,
  saldoSuscriptor,
  type Cobro,
  type ValoresTarifa,
} from "./index";

// Ensamblado de los datos de un comprobante (factura del mes / comprobante de pago).
// Lógica PURA y framework-agnóstica: produce el "view model" que la plantilla HTML de
// mobile (Fase 2) renderiza a PDF. Sin React, sin RN, sin Supabase → 100% testeable.

const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// "2026-06-01" -> "Junio 2026"
export function formatPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-");
  const idx = parseInt(mes ?? "1", 10) - 1;
  return `${MESES_LARGO[idx] ?? ""} ${anio ?? ""}`.trim();
}

// --- Factura del mes -------------------------------------------------------

// Una lectura por medidor: el desglose se calcula POR medidor (cada uno suma su
// propio cargo fijo), igual que generar_cargos_mes. Por eso recibimos las líneas.
export interface LineaConsumo {
  numeroSerie: string;
  consumo: number;
}

export interface LineaFactura extends Cobro {
  numeroSerie: string;
  consumo: number;
}

export interface FacturaInput {
  folio: number;
  organizacion: string;
  suscriptor: string;
  periodo: string;          // fecha del cargo: "2026-06-01"
  lineas: LineaConsumo[];   // consumo por medidor del período
  tarifa: ValoresTarifa;    // la del PERÍODO (no la última vigente)
  totalCongelado: number;   // cargo.monto: la autoridad del total a pagar
  saldoCuenta: number;      // saldo actual del suscriptor (Σ cargos − Σ pagos)
  emitidoEn: string;        // fecha de emisión (string ya formateado o ISO)
}

export interface DatosFactura {
  folio: number;
  organizacion: string;
  suscriptor: string;
  periodo: string;          // etiqueta "Junio 2026"
  lineas: LineaFactura[];
  consumoTotal: number;
  subtotalCargoFijo: number;
  subtotalExcedente: number;
  total: number;            // = totalCongelado (autoridad), NO la suma recalculada
  saldoCuenta: number;
  emitidoEn: string;
}

export function construirFactura(input: FacturaInput): DatosFactura {
  // Desglose por medidor: cada línea aporta su cargo fijo + su excedente.
  const lineas: LineaFactura[] = input.lineas.map((l) => ({
    numeroSerie: l.numeroSerie,
    consumo: l.consumo,
    ...calcularCobro(l.consumo, input.tarifa),
  }));

  const consumoTotal = lineas.reduce((s, l) => s + l.consumo, 0);
  const subtotalCargoFijo = lineas.reduce((s, l) => s + l.cargoFijo, 0);
  const subtotalExcedente = lineas.reduce((s, l) => s + l.excedente, 0);

  return {
    folio: input.folio,
    organizacion: input.organizacion,
    suscriptor: input.suscriptor,
    periodo: formatPeriodo(input.periodo),
    lineas,
    consumoTotal,
    subtotalCargoFijo,
    subtotalExcedente,
    // El total siempre es el monto CONGELADO del cargo. El desglose es informativo;
    // si por un cambio de datos no cuadrara con la suma, manda el congelado.
    total: input.totalCongelado,
    saldoCuenta: input.saldoCuenta,
    emitidoEn: input.emitidoEn,
  };
}

// --- Comprobante de pago ---------------------------------------------------

export interface ComprobantePagoInput {
  folio: number;
  organizacion: string;
  suscriptor: string;
  pago: Pick<Pago, "monto" | "fecha_pago" | "metodo">;
  // Estado de cuenta DESPUÉS del pago (el pago ya está incluido en `pagos`):
  cargos: Pick<Cargo, "monto">[];
  pagos: Pick<Pago, "monto">[];
  emitidoEn: string;
}

export interface DatosComprobantePago {
  folio: number;
  organizacion: string;
  suscriptor: string;
  fechaPago: string;
  metodo: string;
  montoPagado: number;
  saldoRestante: number;
  emitidoEn: string;
}

export function construirComprobantePago(
  input: ComprobantePagoInput
): DatosComprobantePago {
  // Saldo restante = el saldo de cuenta una vez aplicado el pago.
  const saldoRestante = saldoSuscriptor(input.cargos, input.pagos);
  return {
    folio: input.folio,
    organizacion: input.organizacion,
    suscriptor: input.suscriptor,
    fechaPago: input.pago.fecha_pago,
    metodo: input.pago.metodo,
    montoPagado: input.pago.monto,
    saldoRestante,
    emitidoEn: input.emitidoEn,
  };
}
