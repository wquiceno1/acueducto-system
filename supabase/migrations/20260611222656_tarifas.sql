-- Paso 5: tabla tarifas (reemplaza las constantes hardcodeadas de apps/web/lib/tarifas.ts).
-- Cada comunidad aprueba sus tarifas en asamblea, por eso van por organizacion y
-- con vigente_desde (historico). El seed reproduce EXACTAMENTE los valores que
-- hoy estan hardcodeados, para que el cobro no cambie al migrar el codigo:
--   CARGO_FIJO = 10_000, CONSUMO_BASE_M3 = 15, PRECIO_EXCEDENTE_M3 = 1_000

create table public.tarifas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  cargo_fijo numeric not null,
  consumo_base_m3 numeric not null,
  precio_excedente_m3 numeric not null,
  vigente_desde date not null default current_date,
  created_at timestamptz not null default now()
);

create index idx_tarifas_org on public.tarifas (organizacion_id);

alter table public.tarifas enable row level security;

insert into public.tarifas (organizacion_id, cargo_fijo, consumo_base_m3, precio_excedente_m3)
values (
  (select id from public.organizaciones where nombre = 'Santa Bárbara'),
  10000, 15, 1000
);
