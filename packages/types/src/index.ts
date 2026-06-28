// Roles del sistema
// - super_admin: "admin ultra", opera sobre todas las organizaciones (dueño del sistema)
// - admin: administra su propia comunidad (p. ej. tesorera)
// - operario: registra lecturas en terreno
// - vecino: suscriptor (futuro portal de consumo)
export type UserRole = "super_admin" | "admin" | "operario" | "vecino";

// Organizacion (tenant): cada comunidad/acueducto es una organizacion.
export interface Organizacion {
  id: string;
  nombre: string;
  created_at: string;
}

// Perfil de usuario (tabla profiles): rol + organizacion a la que pertenece.
export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  telefono?: string;
  organizacion_id: string;
  created_at: string;
}

// Tarifas aprobadas por la comunidad (reemplaza las constantes hardcodeadas).
export interface Tarifa {
  id: string;
  organizacion_id: string;
  cargo_fijo: number;
  consumo_base_m3: number;
  precio_excedente_m3: number;
  vigente_desde: string;
  created_at: string;
}

// --- Cobranza (cuenta corriente) ---
export type MetodoPago = "efectivo" | "transferencia" | "otro";

// Cargo: snapshot congelado de lo que debe un suscriptor en un mes.
export interface Cargo {
  id: string;
  organizacion_id: string;
  suscriptor_id: string;
  periodo: string; // primer día del mes (AAAA-MM-DD)
  monto: number;
  consumo_total?: number;
  generado_at: string;
}

// Pago: abono del suscriptor, aplicado a cuenta (al saldo).
export interface Pago {
  id: string;
  organizacion_id: string;
  suscriptor_id: string;
  monto: number;
  fecha_pago: string;
  metodo: MetodoPago;
  notas?: string;
  created_at: string;
}

// Tipo de comprobante emitido.
export type TipoComprobante = "factura" | "pago";

// Comprobante: emisión de un documento (factura del mes o comprobante de pago) con folio
// consecutivo por organización. No guarda el PDF; se regenera desde los datos.
//   tipo='factura' -> referencia_id apunta a un Cargo
//   tipo='pago'    -> referencia_id apunta a un Pago
export interface Comprobante {
  id: string;
  organizacion_id: string;
  tipo: TipoComprobante;
  folio: number;
  referencia_id: string;
  suscriptor_id: string;
  total: number;
  emitido_por?: string;
  emitido_at: string;
}

// Suscriptor (vecino con medidor)
export interface Suscriptor {
  id: string;
  organizacion_id: string;
  nombre: string;
  apellido: string;
  direccion: string;
  telefono?: string;
  email?: string;
  activo: boolean;
  created_at: string;
}

// Medidor asignado a un suscriptor
export interface Medidor {
  id: string;
  organizacion_id: string;
  numero_serie: string;
  suscriptor_id: string;
  sector?: string;
  fecha_instalacion: string;
  activo: boolean;
  suscriptor?: Suscriptor; // join opcional
}

// Lectura de un medidor
export interface Lectura {
  id: string;
  organizacion_id: string;
  medidor_id: string;
  operario_id: string;
  lectura_anterior: number;
  lectura_actual: number;
  consumo: number; // calculado: actual - anterior
  fecha_lectura: string;
  foto_url?: string;
  notas?: string;
  sync_status: "pendiente" | "sincronizado";
  created_at: string;
  medidor?: Medidor; // join opcional
}

// Período de facturación (para Fase 2)
export interface Periodo {
  id: string;
  organizacion_id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
}
