-- RPC: genera (o regenera) los cargos congelados de un mes para la org del usuario.
--
-- Lógica contable clave: usa la tarifa que REGÍA en ese período (la de mayor
-- vigente_desde <= último día del mes), NO la más reciente. Eso es lo que hace que
-- la deuda de un mes pasado no cambie aunque después se modifique la tarifa.
--
-- El monto del cargo de un suscriptor = Σ de los cobros de sus medidores con lectura
-- en el mes, replicando calcularCobro: cargo_fijo + max(0, consumo - base) * excedente
-- (cargo fijo por medidor, igual que el Resumen actual).
--
-- Idempotente: re-ejecutar el mismo período actualiza los cargos (ON CONFLICT).
-- SECURITY DEFINER pero con chequeo de rol: solo admin / super_admin.

create or replace function public.generar_cargos_mes(p_periodo date)
returns integer
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_inicio date;
  v_fin date;
  v_tarifa public.tarifas%rowtype;
  v_count integer := 0;
begin
  if public.get_my_role() not in ('admin', 'super_admin') then
    raise exception 'No autorizado para generar cargos';
  end if;

  v_org := public.get_my_org();
  if v_org is null then
    raise exception 'El usuario no tiene organización asignada';
  end if;

  -- Rango del mes a partir del período recibido.
  v_inicio := date_trunc('month', p_periodo)::date;
  v_fin := (date_trunc('month', p_periodo) + interval '1 month' - interval '1 day')::date;

  -- Tarifa que regía ese período.
  select * into v_tarifa
  from public.tarifas
  where organizacion_id = v_org
    and vigente_desde <= v_fin
  order by vigente_desde desc
  limit 1;

  if v_tarifa.id is null then
    raise exception 'No hay una tarifa vigente para el período %', v_inicio;
  end if;

  -- Un cargo por suscriptor: suma de los cobros de sus medidores con lectura en el mes.
  insert into public.cargos (organizacion_id, suscriptor_id, periodo, monto, consumo_total)
  select
    v_org,
    m.suscriptor_id,
    v_inicio,
    sum(
      v_tarifa.cargo_fijo
      + greatest(0, l.consumo - v_tarifa.consumo_base_m3) * v_tarifa.precio_excedente_m3
    ),
    sum(l.consumo)
  from public.lecturas l
  join public.medidores m on m.id = l.medidor_id
  where l.organizacion_id = v_org
    and l.fecha_lectura >= v_inicio
    and l.fecha_lectura <= v_fin
  group by m.suscriptor_id
  on conflict (suscriptor_id, periodo) do update set
    monto = excluded.monto,
    consumo_total = excluded.consumo_total,
    generado_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter function public.generar_cargos_mes(date) owner to postgres;
grant execute on function public.generar_cargos_mes(date) to authenticated;
