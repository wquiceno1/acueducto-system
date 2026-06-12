-- Paso 2: tabla organizaciones (tenant) + seed de la comunidad actual.
-- Multi-tenant: cada comunidad/acueducto es una organizacion. Por ahora solo
-- existe una (Santa Barbara); el resto del schema cuelga de aca.
--
-- Nota de orden: la RLS se habilita aca, pero la policy de SELECT vive en la
-- migracion 20260611222657_rls_por_organizacion.sql porque depende de
-- get_my_org(), que a su vez necesita profiles.organizacion_id (migracion
-- 20260611222655). Hasta que esa migracion corra, organizaciones queda sin
-- filas visibles via RLS (solo accesible por funciones SECURITY DEFINER).

create table public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

alter table public.organizaciones enable row level security;

-- Seed: comunidad actual.
insert into public.organizaciones (nombre) values ('Santa Bárbara');
