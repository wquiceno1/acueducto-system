-- Módulo de cobranza (cuenta corriente). Dos tablas:
--   cargos: snapshot CONGELADO de lo que debe un suscriptor en un mes
--           (calculado con la tarifa que regía ese mes; no cambia después).
--   pagos:  abonos del suscriptor, aplicados a cuenta (al saldo, no a un cargo puntual).
-- Saldo del suscriptor = Σ cargos − Σ pagos.
-- Acceso: solo admin / super_admin (la cobranza es de la tesorera; el operario no la ve).

-- ----------------------------------------------------------------------------
-- cargos
-- ----------------------------------------------------------------------------
create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  suscriptor_id uuid not null references public.suscriptores(id),
  periodo date not null,                 -- primer día del mes: 2026-06-01
  monto numeric not null,                -- total congelado del mes
  consumo_total numeric,                 -- m³ del mes (para detalle/recibo)
  generado_at timestamptz not null default now(),
  unique (suscriptor_id, periodo)        -- un cargo por suscriptor por mes (idempotente)
);

create index idx_cargos_org on public.cargos (organizacion_id);
create index idx_cargos_suscriptor on public.cargos (suscriptor_id);
create index idx_cargos_periodo on public.cargos (periodo);

alter table public.cargos enable row level security;

create trigger set_org_cargos before insert on public.cargos
  for each row execute function public.set_organizacion_id();

create policy "cargos_select" on public.cargos
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

create policy "cargos_insert" on public.cargos
  for insert with check (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

create policy "cargos_update" on public.cargos
  for update using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

create policy "cargos_delete" on public.cargos
  for delete using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

-- ----------------------------------------------------------------------------
-- pagos
-- ----------------------------------------------------------------------------
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  suscriptor_id uuid not null references public.suscriptores(id),
  monto numeric not null check (monto > 0),
  fecha_pago date not null default current_date,
  metodo text not null default 'efectivo'
    check (metodo = any (array['efectivo','transferencia','otro'])),
  notas text,
  created_at timestamptz not null default now()
);

create index idx_pagos_org on public.pagos (organizacion_id);
create index idx_pagos_suscriptor on public.pagos (suscriptor_id);

alter table public.pagos enable row level security;

create trigger set_org_pagos before insert on public.pagos
  for each row execute function public.set_organizacion_id();

create policy "pagos_select" on public.pagos
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

create policy "pagos_insert" on public.pagos
  for insert with check (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

create policy "pagos_update" on public.pagos
  for update using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

create policy "pagos_delete" on public.pagos
  for delete using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );
