"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/Modal";
import type { Medidor, Suscriptor } from "@acueducto/types";

type MedidorConSuscriptor = Medidor & { suscriptor: Suscriptor };

type FormData = {
  numero_serie: string;
  suscriptor_id: string;
  sector: string;
  fecha_instalacion: string;
};

function hoy() {
  return new Date().toISOString().split("T")[0] ?? "";
}

const EMPTY_FORM: FormData = {
  numero_serie: "",
  suscriptor_id: "",
  sector: "",
  fecha_instalacion: hoy(),
};

export default function MedidoresPage() {
  const [medidores, setMedidores] = useState<MedidorConSuscriptor[]>([]);
  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<MedidorConSuscriptor | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Búsqueda de suscriptor dentro del selector
  const [busquedaSuscriptor, setBusquedaSuscriptor] = useState("");

  const searchParams = useSearchParams();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const sid = searchParams.get("suscriptor_id");
    const snombre = searchParams.get("suscriptor_nombre");
    if (sid && snombre) {
      setForm({ ...EMPTY_FORM, suscriptor_id: sid, fecha_instalacion: hoy() });
      setBusquedaSuscriptor(snombre);
      setModalOpen(true);
    }
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: medData }, { data: susData }] = await Promise.all([
      supabase
        .from("medidores")
        .select("*, suscriptor:suscriptores(*)")
        .order("numero_serie", { ascending: true }),
      supabase
        .from("suscriptores")
        .select("*")
        .eq("activo", true)
        .order("apellido", { ascending: true }),
    ]);
    setMedidores((medData ?? []) as MedidorConSuscriptor[]);
    setSuscriptores((susData ?? []) as Suscriptor[]);
    setLoading(false);
  }

  function abrirCrear() {
    setEditando(null);
    setForm({ ...EMPTY_FORM, fecha_instalacion: hoy() });
    setBusquedaSuscriptor("");
    setError("");
    setModalOpen(true);
  }

  function abrirEditar(m: MedidorConSuscriptor) {
    setEditando(m);
    setForm({
      numero_serie: m.numero_serie,
      suscriptor_id: m.suscriptor_id,
      sector: m.sector ?? "",
      fecha_instalacion: m.fecha_instalacion,
    });
    setBusquedaSuscriptor(
      m.suscriptor ? `${m.suscriptor.apellido}, ${m.suscriptor.nombre}` : ""
    );
    setError("");
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditando(null);
    setError("");
    setBusquedaSuscriptor("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      numero_serie: form.numero_serie.trim(),
      suscriptor_id: form.suscriptor_id,
      sector: form.sector.trim() || null,
      fecha_instalacion: form.fecha_instalacion,
    };

    if (!payload.numero_serie) {
      setError("El número de serie es requerido.");
      setSaving(false);
      return;
    }
    if (!payload.suscriptor_id) {
      setError("Debés seleccionar un usuario.");
      setSaving(false);
      return;
    }
    if (!payload.fecha_instalacion) {
      setError("La fecha de instalación es requerida.");
      setSaving(false);
      return;
    }

    if (editando) {
      const { error: err } = await supabase
        .from("medidores")
        .update(payload)
        .eq("id", editando.id);
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await supabase
        .from("medidores")
        .insert({ ...payload, activo: true });
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    cerrarModal();
    loadData();
  }

  async function toggleActivo(m: MedidorConSuscriptor) {
    await supabase
      .from("medidores")
      .update({ activo: !m.activo })
      .eq("id", m.id);
    loadData();
  }

  const filtrados = medidores.filter((m) => {
    const q = busqueda.toLowerCase();
    return (
      m.numero_serie.toLowerCase().includes(q) ||
      (m.suscriptor &&
        (`${m.suscriptor.nombre} ${m.suscriptor.apellido}`
          .toLowerCase()
          .includes(q) ||
          `${m.suscriptor.apellido} ${m.suscriptor.nombre}`
            .toLowerCase()
            .includes(q)))
    );
  });

  // Suscriptores filtrados por búsqueda en el selector del modal
  const suscriptoresFiltrados = suscriptores.filter((s) => {
    const q = busquedaSuscriptor.toLowerCase();
    if (!q) return true;
    return (
      s.nombre.toLowerCase().includes(q) ||
      s.apellido.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Medidores</h2>
          <p className="text-sm text-gray-500">
            Gestión de medidores asignados a usuarios
          </p>
        </div>
        <button
          onClick={abrirCrear}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0"
        >
          + Nuevo medidor
        </button>
      </div>

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar por número de serie o usuario..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full sm:max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <p className="text-gray-400">No se encontraron medidores.</p>
        </div>
      ) : (
        <>
          {/* Vista desktop */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    N° Serie
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Usuario
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Sector
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Instalación
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Estado
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      #{m.numero_serie}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {m.suscriptor
                        ? `${m.suscriptor.apellido}, ${m.suscriptor.nombre}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {m.sector ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {m.fecha_instalacion}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.activo
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {m.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => abrirEditar(m)}
                        className="text-xs text-blue-500 hover:text-blue-700 mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActivo(m)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        {m.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista mobile: cards */}
          <div className="block sm:hidden space-y-3">
            {filtrados.map((m) => (
              <div
                key={m.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-800">
                    #{m.numero_serie}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.activo
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {m.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">Usuario</span>
                  <span className="text-gray-700 text-right">
                    {m.suscriptor
                      ? `${m.suscriptor.apellido}, ${m.suscriptor.nombre}`
                      : "—"}
                  </span>
                  <span className="text-gray-500">Sector</span>
                  <span className="text-gray-700 text-right">
                    {m.sector ?? "—"}
                  </span>
                  <span className="text-gray-500">Instalación</span>
                  <span className="text-gray-700 text-right">
                    {m.fecha_instalacion}
                  </span>
                </div>
                <div className="px-4 py-2 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={() => abrirEditar(m)}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActivo(m)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    {m.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        title={editando ? "Editar medidor" : "Nuevo medidor"}
        onClose={cerrarModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de serie <span className="text-red-500">*</span>
            </label>
            <input
              value={form.numero_serie}
              onChange={(e) =>
                setForm((f) => ({ ...f, numero_serie: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ABC123"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario <span className="text-red-500">*</span>
            </label>
            {/* Input de búsqueda + select */}
            <input
              type="text"
              placeholder="Filtrar usuario..."
              value={busquedaSuscriptor}
              onChange={(e) => {
                setBusquedaSuscriptor(e.target.value);
                // Si el usuario borra el texto, limpiamos la selección
                if (!e.target.value) {
                  setForm((f) => ({ ...f, suscriptor_id: "" }));
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1"
            />
            <select
              value={form.suscriptor_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, suscriptor_id: e.target.value }))
              }
              size={Math.min(5, suscriptoresFiltrados.length + 1)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Seleccioná un usuario —</option>
              {suscriptoresFiltrados.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.apellido}, {s.nombre} — {s.direccion}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sector
            </label>
            <input
              value={form.sector}
              onChange={(e) =>
                setForm((f) => ({ ...f, sector: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Norte, Centro, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de instalación <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.fecha_instalacion}
              onChange={(e) =>
                setForm((f) => ({ ...f, fecha_instalacion: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarModal}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
