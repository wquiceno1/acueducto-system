"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/Modal";
import type { Suscriptor } from "@acueducto/types";

type FormData = {
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  email: string;
};

const EMPTY_FORM: FormData = {
  nombre: "",
  apellido: "",
  direccion: "",
  telefono: "",
  email: "",
};

export default function SuscriptoresPage() {
  const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Suscriptor | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSuscriptores();
  }, []);

  async function loadSuscriptores() {
    setLoading(true);
    const { data } = await supabase
      .from("suscriptores")
      .select("*")
      .order("apellido", { ascending: true });
    setSuscriptores((data ?? []) as Suscriptor[]);
    setLoading(false);
  }

  function abrirCrear() {
    setEditando(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  }

  function abrirEditar(s: Suscriptor) {
    setEditando(s);
    setForm({
      nombre: s.nombre,
      apellido: s.apellido,
      direccion: s.direccion,
      telefono: s.telefono ?? "",
      email: s.email ?? "",
    });
    setError("");
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditando(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      direccion: form.direccion.trim(),
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
    };

    if (!payload.nombre || !payload.apellido || !payload.direccion) {
      setError("Nombre, apellido y dirección son requeridos.");
      setSaving(false);
      return;
    }

    if (editando) {
      const { error: err } = await supabase
        .from("suscriptores")
        .update(payload)
        .eq("id", editando.id);
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await supabase
        .from("suscriptores")
        .insert({ ...payload, activo: true });
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    cerrarModal();
    loadSuscriptores();
  }

  async function toggleActivo(s: Suscriptor) {
    await supabase
      .from("suscriptores")
      .update({ activo: !s.activo })
      .eq("id", s.id);
    loadSuscriptores();
  }

  const filtrados = suscriptores.filter((s) => {
    const q = busqueda.toLowerCase();
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
          <h2 className="text-xl font-bold text-gray-800">Usuarios</h2>
          <p className="text-sm text-gray-500">
            Gestión de usuarios del acueducto
          </p>
        </div>
        <button
          onClick={abrirCrear}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0"
        >
          + Nuevo usuario
        </button>
      </div>

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar por nombre o apellido..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full sm:max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <p className="text-gray-400">No se encontraron usuarios.</p>
        </div>
      ) : (
        <>
          {/* Vista desktop */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Dirección</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Teléfono</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {s.apellido}, {s.nombre}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.direccion}</td>
                    <td className="px-4 py-3 text-gray-500">{s.telefono ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{s.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.activo
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {s.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => abrirEditar(s)}
                        className="text-xs text-blue-500 hover:text-blue-700 mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActivo(s)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline mr-3"
                      >
                        {s.activo ? "Desactivar" : "Activar"}
                      </button>
                      <Link
                        href={`/dashboard/medidores?suscriptor_id=${s.id}&suscriptor_nombre=${encodeURIComponent(s.nombre + " " + s.apellido)}`}
                        className="text-xs text-blue-500 hover:text-blue-700 underline"
                      >
                        + Medidor
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista mobile: cards */}
          <div className="block sm:hidden space-y-3">
            {filtrados.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-800">
                    {s.apellido}, {s.nombre}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.activo
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">Dirección</span>
                  <span className="text-gray-700 text-right">{s.direccion}</span>
                  <span className="text-gray-500">Teléfono</span>
                  <span className="text-gray-700 text-right">{s.telefono ?? "—"}</span>
                  <span className="text-gray-500">Email</span>
                  <span className="text-gray-700 text-right break-all">{s.email ?? "—"}</span>
                </div>
                <div className="px-4 py-2 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={() => abrirEditar(s)}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActivo(s)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    {s.activo ? "Desactivar" : "Activar"}
                  </button>
                  <Link
                    href={`/dashboard/medidores?suscriptor_id=${s.id}&suscriptor_nombre=${encodeURIComponent(s.nombre + " " + s.apellido)}`}
                    className="text-xs text-blue-500 hover:text-blue-700 underline"
                  >
                    + Medidor
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        title={editando ? "Editar usuario" : "Nuevo usuario"}
        onClose={cerrarModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Juan"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input
              value={form.apellido}
              onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Pérez"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección <span className="text-red-500">*</span>
            </label>
            <input
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Calle 1 # 2-3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="3001234567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="juan@ejemplo.com"
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
