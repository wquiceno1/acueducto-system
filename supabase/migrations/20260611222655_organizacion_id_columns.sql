-- Pasos 3 y 4: columna organizacion_id en las tablas existentes.
-- Patron por tabla: agregar columna nullable -> backfill a la unica org actual
-- -> set not null. (No se toca 'periodos': esa tabla aun no existe.)
--
-- El backfill apunta a Santa Barbara por nombre. Como hoy hay una sola org, es
-- equivalente a "la org actual"; se usa el nombre para ser explicito.

-- helper textual: (select id from public.organizaciones where nombre = 'Santa Bárbara')

-- suscriptores
alter table public.suscriptores
  add column organizacion_id uuid references public.organizaciones(id);
update public.suscriptores
  set organizacion_id = (select id from public.organizaciones where nombre = 'Santa Bárbara');
alter table public.suscriptores
  alter column organizacion_id set not null;
create index idx_suscriptores_org on public.suscriptores (organizacion_id);

-- medidores
alter table public.medidores
  add column organizacion_id uuid references public.organizaciones(id);
update public.medidores
  set organizacion_id = (select id from public.organizaciones where nombre = 'Santa Bárbara');
alter table public.medidores
  alter column organizacion_id set not null;
create index idx_medidores_org on public.medidores (organizacion_id);

-- lecturas
alter table public.lecturas
  add column organizacion_id uuid references public.organizaciones(id);
update public.lecturas
  set organizacion_id = (select id from public.organizaciones where nombre = 'Santa Bárbara');
alter table public.lecturas
  alter column organizacion_id set not null;
create index idx_lecturas_org on public.lecturas (organizacion_id);

-- profiles (la tabla ya existia; solo se le agrega la pertenencia a org)
alter table public.profiles
  add column organizacion_id uuid references public.organizaciones(id);
update public.profiles
  set organizacion_id = (select id from public.organizaciones where nombre = 'Santa Bárbara');
alter table public.profiles
  alter column organizacion_id set not null;
create index idx_profiles_org on public.profiles (organizacion_id);
