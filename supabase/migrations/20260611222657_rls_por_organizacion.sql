-- Paso 6: RLS por organizacion.
-- La RLS ya existia (basada en get_my_role()). Aca se agrega la dimension de
-- tenant: cada policy ahora exige ademas que la fila pertenezca a la org del
-- usuario (organizacion_id = get_my_org()). Patron: drop + recreate.

-- ----------------------------------------------------------------------------
-- 1. Funcion helper: org del usuario actual (analoga a get_my_role()).
--    SECURITY DEFINER -> puede leer profiles sin disparar su propia RLS.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_org() returns uuid
    language sql stable security definer
    as $$
  select organizacion_id from public.profiles where id = auth.uid();
$$;

alter function public.get_my_org() owner to postgres;
grant all on function public.get_my_org() to anon;
grant all on function public.get_my_org() to authenticated;
grant all on function public.get_my_org() to service_role;

-- ----------------------------------------------------------------------------
-- 2. organizaciones: una org solo se ve a si misma.
-- ----------------------------------------------------------------------------
create policy "organizaciones_select" on public.organizaciones
  for select using (id = public.get_my_org());

-- ----------------------------------------------------------------------------
-- 3. tarifas: lectura para admin/operario de la org; escritura solo admin.
-- ----------------------------------------------------------------------------
create policy "tarifas_select" on public.tarifas
  for select using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = any (array['admin','operario'])
  );

create policy "tarifas_insert" on public.tarifas
  for insert with check (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

create policy "tarifas_update" on public.tarifas
  for update using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 4. suscriptores: se agrega el chequeo de org a las policies existentes.
-- ----------------------------------------------------------------------------
drop policy "suscriptores_select" on public.suscriptores;
create policy "suscriptores_select" on public.suscriptores
  for select using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = any (array['admin','operario'])
  );

drop policy "suscriptores_insert" on public.suscriptores;
create policy "suscriptores_insert" on public.suscriptores
  for insert with check (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

drop policy "suscriptores_update" on public.suscriptores;
create policy "suscriptores_update" on public.suscriptores
  for update using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 5. medidores
-- ----------------------------------------------------------------------------
drop policy "medidores_select" on public.medidores;
create policy "medidores_select" on public.medidores
  for select using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = any (array['admin','operario'])
  );

drop policy "medidores_insert" on public.medidores;
create policy "medidores_insert" on public.medidores
  for insert with check (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

drop policy "medidores_update" on public.medidores;
create policy "medidores_update" on public.medidores
  for update using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 6. lecturas (el operario sigue viendo solo las suyas, pero acotado a su org)
-- ----------------------------------------------------------------------------
drop policy "lecturas_select" on public.lecturas;
create policy "lecturas_select" on public.lecturas
  for select using (
    organizacion_id = public.get_my_org()
    and (public.get_my_role() = 'admin' or operario_id = auth.uid())
  );

drop policy "lecturas_insert" on public.lecturas;
create policy "lecturas_insert" on public.lecturas
  for insert with check (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = any (array['admin','operario'])
  );

drop policy "lecturas_update" on public.lecturas;
create policy "lecturas_update" on public.lecturas
  for update using (
    organizacion_id = public.get_my_org()
    and public.get_my_role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 7. profiles: un admin solo ve/edita perfiles de su org. El usuario siempre
--    puede verse/editarse a si mismo (independiente de la org).
-- ----------------------------------------------------------------------------
drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or (public.get_my_role() = 'admin' and organizacion_id = public.get_my_org())
  );

drop policy "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (
    id = auth.uid()
    or (public.get_my_role() = 'admin' and organizacion_id = public.get_my_org())
  );

-- profiles_insert se mantiene igual (id = auth.uid()): el alta real la hace el
-- trigger handle_new_user (SECURITY DEFINER), que ademas setea la org.

-- ----------------------------------------------------------------------------
-- 8. Trigger de alta: profiles.organizacion_id ahora es NOT NULL, asi que el
--    trigger DEBE setearla o todo signup fallaria. Decision de diseno:
--      - Si el signup pasa 'organizacion_id' en raw_user_meta_data, se usa.
--      - Si no, cae a la unica organizacion existente (hoy Santa Barbara).
--    Esto evita la "bomba de tiempo": el dia que exista >1 org, basta con que
--    el signup mande organizacion_id en metadata; no hay que volver a tocar el
--    trigger. El fallback por limit 1 solo aplica mientras haya una sola org.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    as $$
begin
  insert into public.profiles (id, full_name, role, organizacion_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    coalesce(new.raw_user_meta_data->>'role', 'vecino'),
    coalesce(
      (new.raw_user_meta_data->>'organizacion_id')::uuid,
      (select id from public.organizaciones order by created_at limit 1)
    )
  );
  return new;
end;
$$;
