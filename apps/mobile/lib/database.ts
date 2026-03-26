import * as SQLite from "expo-sqlite";
import { Lectura, Medidor } from "@acueducto/types";

const db = SQLite.openDatabaseSync("acueducto.db");

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS medidores (
      id TEXT PRIMARY KEY,
      numero_serie TEXT NOT NULL,
      suscriptor_id TEXT NOT NULL,
      sector TEXT,
      suscriptor_nombre TEXT,
      suscriptor_apellido TEXT,
      suscriptor_direccion TEXT,
      activo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS lecturas (
      id TEXT PRIMARY KEY,
      medidor_id TEXT NOT NULL,
      operario_id TEXT NOT NULL,
      lectura_anterior REAL NOT NULL,
      lectura_actual REAL NOT NULL,
      consumo REAL NOT NULL,
      fecha_lectura TEXT NOT NULL,
      foto_url TEXT,
      notas TEXT,
      sync_status TEXT DEFAULT 'pendiente',
      created_at TEXT NOT NULL
    );
  `);
}

export function getMedidores(): any[] {
  return db.getAllSync("SELECT * FROM medidores WHERE activo = 1 ORDER BY suscriptor_apellido");
}

export function saveMedidoresLocally(medidores: any[]) {
  db.withTransactionSync(() => {
    for (const m of medidores) {
      db.runSync(
        `INSERT OR REPLACE INTO medidores
         (id, numero_serie, suscriptor_id, sector, suscriptor_nombre, suscriptor_apellido, suscriptor_direccion, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id,
          m.numero_serie,
          m.suscriptor_id,
          m.sector ?? null,
          m.suscriptor?.nombre ?? "",
          m.suscriptor?.apellido ?? "",
          m.suscriptor?.direccion ?? "",
          m.activo ? 1 : 0,
        ]
      );
    }
  });
}

export function saveLecturaLocally(lectura: Omit<Lectura, "consumo">) {
  const consumo = lectura.lectura_actual - lectura.lectura_anterior;
  db.runSync(
    `INSERT INTO lecturas
     (id, medidor_id, operario_id, lectura_anterior, lectura_actual, consumo, fecha_lectura, foto_url, notas, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    [
      lectura.id,
      lectura.medidor_id,
      lectura.operario_id,
      lectura.lectura_anterior,
      lectura.lectura_actual,
      consumo,
      lectura.fecha_lectura,
      lectura.foto_url ?? null,
      lectura.notas ?? null,
      lectura.created_at,
    ]
  );
}

export function getPendingLecturas(): any[] {
  return db.getAllSync("SELECT * FROM lecturas WHERE sync_status = 'pendiente'");
}

export function markLecturaAsSynced(id: string) {
  db.runSync("UPDATE lecturas SET sync_status = 'sincronizado' WHERE id = ?", [id]);
}
