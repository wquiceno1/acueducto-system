import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../lib/supabase";
import { getPendingLecturas, markLecturaAsSynced, saveMedidoresLocally, saveLecturasHistorial, clearLecturasSincronizadas } from "../lib/database";

export async function syncNow() {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return;

  const pending = getPendingLecturas();
  for (const lectura of pending) {
    const { error } = await supabase.from("lecturas").insert({
      id: lectura.id,
      medidor_id: lectura.medidor_id,
      operario_id: lectura.operario_id,
      lectura_anterior: lectura.lectura_anterior,
      lectura_actual: lectura.lectura_actual,
      fecha_lectura: lectura.fecha_lectura,
      foto_url: lectura.foto_url,
      notas: lectura.notas,
    });
    if (!error) markLecturaAsSynced(lectura.id);
  }

  const { data: medidoresData } = await supabase
    .from("medidores")
    .select("*, suscriptor:suscriptores(nombre, apellido, direccion)")
    .eq("activo", true);
  if (medidoresData) saveMedidoresLocally(medidoresData);

  const { data: lecturasData } = await supabase
    .from("lecturas")
    .select("*")
    .order("fecha_lectura", { ascending: false });
  if (lecturasData) {
    clearLecturasSincronizadas();
    saveLecturasHistorial(lecturasData);
  }
}

export function useSync(operarioId: string | null) {
  useEffect(() => {
    if (!operarioId) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) syncNow();
    });
    return () => unsubscribe();
  }, [operarioId]);
}
