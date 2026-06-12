-- Paso 1 + 2: introducir el rol `super_admin` ("admin ultra") de forma segura.
-- super_admin opera por encima de las organizaciones (alcance cross-comunidad).
-- El RLS que le da ese alcance va en la migración siguiente.

-- ----------------------------------------------------------------------------
-- 1. Permitir 'super_admin' en el CHECK de profiles.role (es text, no enum PG).
-- ----------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['super_admin', 'admin', 'operario', 'vecino']));

-- ----------------------------------------------------------------------------
-- 2. Cerrar el agujero del trigger: el rol ya NO se lee de raw_user_meta_data
--    (metadata escribible por el cliente). Todo usuario nuevo se crea como
--    'vecino'; la promoción a admin/super_admin es manual (UPDATE server-side).
--    Esto evita que, si algún día hay signup público, alguien se auto-asigne un
--    rol privilegiado mandando role en el signup.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    as $$
begin
  insert into public.profiles (id, full_name, role, organizacion_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    'vecino',
    coalesce(
      (new.raw_user_meta_data->>'organizacion_id')::uuid,
      (select id from public.organizaciones order by created_at limit 1)
    )
  );
  return new;
end;
$$;
