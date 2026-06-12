-- Paso 3: dar alcance cross-organizacion a `super_admin`.
-- Se centraliza la dimension de ALCANCE en can_access_org() y se suma
-- 'super_admin' a los chequeos de ACCION donde hoy figura 'admin'.
--
-- Resultado:
--   super_admin -> todas las organizaciones (frontera la marca el rol)
--   admin/operario -> solo su propia org (sin cambios respecto a hoy)

-- ----------------------------------------------------------------------------
-- Helper: ¿el usuario actual puede operar sobre filas de esta organizacion?
-- ----------------------------------------------------------------------------
create or replace function public.can_access_org(row_org uuid) returns boolean
    language sql stable security definer
    as $$
  select public.get_my_role() = 'super_admin' or row_org = public.get_my_org();
$$;

alter function public.can_access_org(uuid) owner to postgres;
grant all on function public.can_access_org(uuid) to anon;
grant all on function public.can_access_org(uuid) to authenticated;
grant all on function public.can_access_org(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- organizaciones: super_admin ve todas; el resto solo la suya.
-- ----------------------------------------------------------------------------
drop policy "organizaciones_select" on public.organizaciones;
create policy "organizaciones_select" on public.organizaciones
  for select using (public.can_access_org(id));

-- ----------------------------------------------------------------------------
-- tarifas
-- ----------------------------------------------------------------------------
drop policy "tarifas_select" on public.tarifas;
create policy "tarifas_select" on public.tarifas
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin','operario'])
  );

drop policy "tarifas_insert" on public.tarifas;
create policy "tarifas_insert" on public.tarifas
  for insert with check (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

drop policy "tarifas_update" on public.tarifas;
create policy "tarifas_update" on public.tarifas
  for update using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

-- ----------------------------------------------------------------------------
-- suscriptores
-- ----------------------------------------------------------------------------
drop policy "suscriptores_select" on public.suscriptores;
create policy "suscriptores_select" on public.suscriptores
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin','operario'])
  );

drop policy "suscriptores_insert" on public.suscriptores;
create policy "suscriptores_insert" on public.suscriptores
  for insert with check (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

drop policy "suscriptores_update" on public.suscriptores;
create policy "suscriptores_update" on public.suscriptores
  for update using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

-- ----------------------------------------------------------------------------
-- medidores
-- ----------------------------------------------------------------------------
drop policy "medidores_select" on public.medidores;
create policy "medidores_select" on public.medidores
  for select using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin','operario'])
  );

drop policy "medidores_insert" on public.medidores;
create policy "medidores_insert" on public.medidores
  for insert with check (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

drop policy "medidores_update" on public.medidores;
create policy "medidores_update" on public.medidores
  for update using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

-- ----------------------------------------------------------------------------
-- lecturas (el operario sigue viendo solo las suyas; super_admin/admin todas las de su alcance)
-- ----------------------------------------------------------------------------
drop policy "lecturas_select" on public.lecturas;
create policy "lecturas_select" on public.lecturas
  for select using (
    public.can_access_org(organizacion_id)
    and (public.get_my_role() = any (array['super_admin','admin']) or operario_id = auth.uid())
  );

drop policy "lecturas_insert" on public.lecturas;
create policy "lecturas_insert" on public.lecturas
  for insert with check (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin','operario'])
  );

drop policy "lecturas_update" on public.lecturas;
create policy "lecturas_update" on public.lecturas
  for update using (
    public.can_access_org(organizacion_id)
    and public.get_my_role() = any (array['super_admin','admin'])
  );

-- ----------------------------------------------------------------------------
-- profiles: el usuario siempre se ve a si mismo. super_admin ve todos los
-- perfiles (todas las orgs); admin solo los de su org.
-- ----------------------------------------------------------------------------
drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or (public.get_my_role() = any (array['super_admin','admin']) and public.can_access_org(organizacion_id))
  );

drop policy "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (
    id = auth.uid()
    or (public.get_my_role() = any (array['super_admin','admin']) and public.can_access_org(organizacion_id))
  );

-- profiles_insert se mantiene (id = auth.uid()): el alta real la hace el trigger.
