-- organizacion_id es NOT NULL en suscriptores/medidores/lecturas/tarifas, pero no
-- tiene default. En vez de obligar a cada formulario (web/mobile) a mandarlo, un
-- trigger before-insert lo completa con la org del usuario (get_my_org()) cuando
-- viene NULL. Centraliza la regla y es a prueba de olvidos.
--
-- Respeta el valor explícito: si el insert ya trae organizacion_id (p. ej. un
-- super_admin creando datos para otra comunidad), el trigger no lo pisa.

create or replace function public.set_organizacion_id() returns trigger
    language plpgsql security definer
    as $$
begin
  if new.organizacion_id is null then
    new.organizacion_id := public.get_my_org();
  end if;
  return new;
end;
$$;

alter function public.set_organizacion_id() owner to postgres;

create trigger set_org_suscriptores before insert on public.suscriptores
  for each row execute function public.set_organizacion_id();

create trigger set_org_medidores before insert on public.medidores
  for each row execute function public.set_organizacion_id();

create trigger set_org_lecturas before insert on public.lecturas
  for each row execute function public.set_organizacion_id();

create trigger set_org_tarifas before insert on public.tarifas
  for each row execute function public.set_organizacion_id();
