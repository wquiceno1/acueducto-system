"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calcularCobro, formatCOP } from "@/lib/tarifas";
import type { Lectura, Medidor, Suscriptor } from "@acueducto/types";

type LecturaConDetalle = Lectura & {
  medidor: Medidor & { suscriptor: Suscriptor };
};

type ResumenSuscriptor = {
  suscriptor_id: string;
  nombre: string;
  apellido: string;
  medidores: {
    numero_serie: string;
    consumo: number;
    cargoFijo: number;
    excedente: number;
    total: number;
    fecha_lectura: string;
    lectura_anterior: number;
    lectura_actual: number;
  }[];
  totalMes: number;
};

export default function DashboardPage() {
  const [lecturas, setLecturas] = useState<LecturaConDetalle[]>([]);
  const [medidoresSinLectura, setMedidoresSinLectura] = useState<
    (Medidor & { suscriptor: Suscriptor })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function loadData() {
    setLoading(true);
    const [year, month] = mes.split("-");
    const desde = `${year}-${month}-01`;
    const hasta = new Date(
      parseInt(year ?? "0"),
      parseInt(month ?? "0"),
      0
    )
      .toISOString()
      .split("T")[0];

    const { data: lecturasData } = await supabase
      .from("lecturas")
      .select("*, medidor:medidores(*, suscriptor:suscriptores(*))")
      .gte("fecha_lectura", desde)
      .lte("fecha_lectura", hasta)
      .order("fecha_lectura", { ascending: false });

    const { data: todosMedidores } = await supabase
      .from("medidores")
      .select("*, suscriptor:suscriptores(*)")
      .eq("activo", true);

    const lecturasArr = (lecturasData ?? []) as LecturaConDetalle[];
    setLecturas(lecturasArr);

    const medidoresConLectura = new Set(lecturasArr.map((l) => l.medidor_id));
    const sinLectura = ((todosMedidores ?? []) as (Medidor & { suscriptor: Suscriptor })[]).filter(
      (m) => !medidoresConLectura.has(m.id)
    );
    setMedidoresSinLectura(sinLectura);

    setLoading(false);
  }

  // Agrupar lecturas por suscriptor
  const mapaS = new Map<string, ResumenSuscriptor>();
  for (const l of lecturas) {
    const sid = l.medidor.suscriptor_id;
    if (!mapaS.has(sid)) {
      mapaS.set(sid, {
        suscriptor_id: sid,
        nombre: l.medidor.suscriptor.nombre,
        apellido: l.medidor.suscriptor.apellido,
        medidores: [],
        totalMes: 0,
      });
    }
    const cobro = calcularCobro(l.consumo);
    const entry = mapaS.get(sid)!;
    entry.medidores.push({
      numero_serie: l.medidor.numero_serie,
      consumo: l.consumo,
      lectura_anterior: l.lectura_anterior,
      lectura_actual: l.lectura_actual,
      fecha_lectura: l.fecha_lectura,
      ...cobro,
    });
    entry.totalMes += cobro.total;
  }

  const resumenPorSuscriptor: ResumenSuscriptor[] = [];
  mapaS.forEach((v) => resumenPorSuscriptor.push(v));
  resumenPorSuscriptor.sort((a, b) => a.apellido.localeCompare(b.apellido));

  const totalRecaudoEstimado = resumenPorSuscriptor.reduce(
    (s, r) => s + r.totalMes,
    0
  );

  return (
    <div className="space-y-8">
      {/* Encabezado y selector de mes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">
            Resumen de consumos
          </h2>
          <p className="text-sm text-gray-500">
            Lecturas registradas por el operario
          </p>
        </div>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Lecturas registradas</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">
            {lecturas.length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Medidores sin lectura</p>
          <p
            className={`text-3xl font-bold mt-1 ${
              medidoresSinLectura.length > 0 ? "text-red-500" : "text-green-500"
            }`}
          >
            {medidoresSinLectura.length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Recaudo estimado</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">
            {formatCOP(totalRecaudoEstimado)}
          </p>
        </div>
      </div>

      {/* Alerta de medidores sin lectura */}
      {medidoresSinLectura.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-semibold text-red-700 mb-2">
            {medidoresSinLectura.length} medidor(es) sin lectura este mes:
          </p>
          <ul className="space-y-1">
            {medidoresSinLectura.map((m) => (
              <li key={m.id} className="text-sm text-red-600">
                #{m.numero_serie} — {m.suscriptor.apellido},{" "}
                {m.suscriptor.nombre} ({m.suscriptor.direccion})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabla de consumos por suscriptor */}
      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : resumenPorSuscriptor.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <p className="text-gray-400">
            No hay lecturas registradas para este período.
          </p>
        </div>
      ) : (
        <>
          {/* Vista desktop: tabla (oculta en mobile) */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Suscriptor
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Medidor
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Ant.
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Act.
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Consumo
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Cargo fijo
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Excedente
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-blue-600">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resumenPorSuscriptor.map((r) =>
                  r.medidores.map((m, i) => (
                    <tr
                      key={`${r.suscriptor_id}-${m.numero_serie}`}
                      className="hover:bg-gray-50"
                    >
                      {i === 0 && (
                        <td
                          rowSpan={r.medidores.length}
                          className="px-4 py-3 font-medium text-gray-800 align-top"
                        >
                          {r.apellido}, {r.nombre}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-500">
                        #{m.numero_serie}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {m.lectura_anterior}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {m.lectura_actual}
                      </td>
                      <td className="px-4 py-3 text-right">{m.consumo} m³</td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {formatCOP(m.cargoFijo)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {formatCOP(m.excedente)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">
                        {formatCOP(m.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-3 font-semibold text-gray-700 text-right"
                  >
                    Total estimado del período
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-blue-600">
                    {formatCOP(totalRecaudoEstimado)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Vista mobile: cards apiladas (ocultas en desktop) */}
          <div className="block sm:hidden space-y-4">
            {resumenPorSuscriptor.map((r) => (
              <div
                key={r.suscriptor_id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* Nombre del suscriptor */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="font-semibold text-gray-800">
                    {r.apellido}, {r.nombre}
                  </p>
                </div>

                {/* Medidores */}
                {r.medidores.map((m, i) => (
                  <div
                    key={m.numero_serie}
                    className={`px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
                  >
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Medidor #{m.numero_serie}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-gray-500">Lectura anterior</span>
                      <span className="text-right text-gray-700">{m.lectura_anterior}</span>
                      <span className="text-gray-500">Lectura actual</span>
                      <span className="text-right text-gray-700">{m.lectura_actual}</span>
                      <span className="text-gray-500">Consumo</span>
                      <span className="text-right text-gray-700">{m.consumo} m³</span>
                      <span className="text-gray-500">Cargo fijo</span>
                      <span className="text-right text-gray-700">{formatCOP(m.cargoFijo)}</span>
                      <span className="text-gray-500">Excedente</span>
                      <span className="text-right text-gray-700">{formatCOP(m.excedente)}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Total medidor</span>
                      <span className="font-semibold text-blue-600">{formatCOP(m.total)}</span>
                    </div>
                  </div>
                ))}

                {/* Total del mes del suscriptor */}
                <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex justify-between items-center">
                  <span className="text-sm font-semibold text-blue-700">Total del mes</span>
                  <span className="text-lg font-bold text-blue-700">{formatCOP(r.totalMes)}</span>
                </div>
              </div>
            ))}

            {/* Total general mobile */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 flex justify-between items-center">
              <span className="font-semibold text-gray-700">Total estimado del período</span>
              <span className="font-bold text-blue-600">{formatCOP(totalRecaudoEstimado)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
