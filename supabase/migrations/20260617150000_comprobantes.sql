-- Comprobantes en PDF (factura del mes + comprobante de pago).
--
-- Un comprobante es la EMISIÓN de un documento con folio consecutivo por organización.
-- No guarda el PDF (se regenera desde los datos): guarda el folio, el tipo, a qué
-- cargo/pago apunta y el total, para trazabilidad y para no quemar números al re-compartir.
--
--   tipo='factura' -> referencia_id = cargos.id  (lo que el suscriptor debe ese mes)
--   tipo='pago'    -> referencia_id = pagos.id   (el abono que hizo)
--
-- Folio: consecutivo SEPARADO por (organizacion_id, tipo). Factura 1,2,3…; pago 1,2,3…
-- Acceso: solo admin / super_admin (la cobranza es de la tesorera).

-- ----------------------------------------------------------------------------
-- comprobante_consecutivos: contador del último folio por (org, tipo).
-- Sin políticas RLS: solo lo toca el RPC emitir_comprobante (security definer).
-- ----------------------------------------------------------------------------
create table public.comprobante_consecutivos (
  organizacion_id uuid not null references public.organizaciones(id),
  tipo text not null check (tipo = any (array['factura','pago'])),
  ultimo_folio integer not null default 0,
  primary key (organizacion_id, tipo)
);

alter table public.comprobante_consecutivos enable row level security;

-- ----------------------------------------------------------------------------
-- comprobantes: una fila por documento emitido.
-- ----------------------------------------------------------------------------
create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  tipo text not null check (tipo = any (array['factura','pago'])),
  folio integer not null,
  referencia_id uuid not null,            -- cargos.id (factura) o pagos.id (pago)
  suscriptor_id uuid not null references public.suscriptores(id),
  total numeric not null,
  emitido_por uuid references auth.users(id),
  emitido_at timestamptz not null default now(),
  unique (organizacion_id, tipo, folio),          -- el número no se repite
  unique (organizacion_id, tipo, referencia_id)   -- idempotencia: 1 comprobante por referencia
);

create index idx_comprobantes_org on public.comprobantes (organizacion_id);
create index idx_comprobantes_suscriptor on public.comprobantes (suscriptor_id);

alter table public.comprobantes enable row level security;

create trigger set_org_comprobantes before insert on public.comprobantes
  for each row execute function public.set_organizacion_id();

-- Solo lectura para la org; el insert entra únicamente por el RPC (security definer),
-- por eso no hay política de insert directo.
create policy "comprobantes_select" on public.comprobantes
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );
