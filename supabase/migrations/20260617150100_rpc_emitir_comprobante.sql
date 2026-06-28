-- RPC: emite (o recupera) un comprobante con folio consecutivo por organización.
--
-- Idempotente por referencia: si ya se emitió el comprobante de ese cargo/pago, devuelve
-- el existente SIN consumir un folio nuevo (re-compartir no quema números).
--
-- El folio se asigna del lado servidor, atómicamente, para que sea único y sin huecos.
-- El suscriptor y el total se toman de la REFERENCIA (cargo o pago), no del cliente:
-- el comprobante refleja el dato congelado, no uno que el front pueda falsear.
--
-- SECURITY DEFINER con chequeo de rol: solo admin / super_admin.

create or replace function public.emitir_comprobante(p_tipo text, p_referencia_id uuid)
returns public.comprobantes
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_suscriptor uuid;
  v_total numeric;
  v_folio integer;
  v_row public.comprobantes;
begin
  if public.get_my_role() not in ('admin', 'super_admin') then
    raise exception 'No autorizado para emitir comprobantes';
  end if;

  if p_tipo not in ('factura', 'pago') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;

  v_org := public.get_my_org();
  if v_org is null then
    raise exception 'El usuario no tiene organización asignada';
  end if;

  -- Idempotencia (caso común: re-compartir). Si ya existe, devolverlo.
  select * into v_row
  from public.comprobantes
  where organizacion_id = v_org and tipo = p_tipo and referencia_id = p_referencia_id;
  if found then
    return v_row;
  end if;

  -- Datos autoritativos desde la referencia (cargo o pago).
  if p_tipo = 'factura' then
    select suscriptor_id, monto into v_suscriptor, v_total
    from public.cargos
    where id = p_referencia_id and organizacion_id = v_org;
  else
    select suscriptor_id, monto into v_suscriptor, v_total
    from public.pagos
    where id = p_referencia_id and organizacion_id = v_org;
  end if;

  if v_suscriptor is null then
    raise exception 'No se encontró la referencia % para el tipo %', p_referencia_id, p_tipo;
  end if;

  -- Asignación del folio + inserción dentro de un bloque con manejo de carrera:
  -- si dos emisiones concurrentes apuntan a la misma referencia, la perdedora cae en
  -- unique_violation, se revierte el incremento del contador (subtransacción) y se
  -- devuelve el comprobante que ganó. Así no quedan huecos en la numeración.
  begin
    insert into public.comprobante_consecutivos (organizacion_id, tipo, ultimo_folio)
    values (v_org, p_tipo, 1)
    on conflict (organizacion_id, tipo)
    do update set ultimo_folio = public.comprobante_consecutivos.ultimo_folio + 1
    returning ultimo_folio into v_folio;

    insert into public.comprobantes
      (organizacion_id, tipo, folio, referencia_id, suscriptor_id, total, emitido_por)
    values
      (v_org, p_tipo, v_folio, p_referencia_id, v_suscriptor, v_total, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    select * into v_row
    from public.comprobantes
    where organizacion_id = v_org and tipo = p_tipo and referencia_id = p_referencia_id;
  end;

  return v_row;
end;
$$;

alter function public.emitir_comprobante(text, uuid) owner to postgres;
grant execute on function public.emitir_comprobante(text, uuid) to authenticated;
