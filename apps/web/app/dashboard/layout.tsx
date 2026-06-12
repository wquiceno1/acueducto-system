"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const NAV_LINKS = [
  { href: "/dashboard", label: "Consumos" },
  { href: "/dashboard/suscriptores", label: "Usuarios" },
  { href: "/dashboard/medidores", label: "Medidores" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // El dashboard web es solo para super_admin. Los demás roles (admin/operario)
  // usan la app móvil. La barrera real es RLS; esto es el guard de UX.
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    let active = true;
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (!active) return;
      setStatus(data?.role === "super_admin" ? "ok" : "denied");
    }
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push("/login");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (status === "checking")
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );

  if (status === "denied")
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold text-gray-800 mb-2">
            Acceso restringido
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            El panel web es solo para el administrador del sistema. Si sos la
            tesorera, gestioná todo desde la app móvil.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium min-h-[44px] px-4"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center gap-3 min-h-[56px]">
        <h1 className="text-base sm:text-lg font-bold text-blue-600 truncate">
          Acueducto — Panel
        </h1>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
          }}
          className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap shrink-0 min-h-[44px] px-2 flex items-center"
        >
          Cerrar sesión
        </button>
      </header>

      {/* Barra de navegación */}
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
