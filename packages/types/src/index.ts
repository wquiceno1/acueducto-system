// Roles del sistema
export type UserRole = "admin" | "operario" | "vecino";

// Suscriptor (vecino con medidor)
export interface Suscriptor {
  id: string;
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
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
}
