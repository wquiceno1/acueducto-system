-- Fix de data: las cuentas semilla del MVP tenian full_name = 'Sin nombre'
-- (default del trigger viejo). Se les pone un nombre legible por rol + comunidad.
-- Se filtra por rol para no depender de IDs concretos (si la DB se resetea y los
-- usuarios de auth no existen, simplemente no afecta filas).

update public.profiles p
set full_name = 'Tesorera Santa Bárbara'
where p.role = 'admin'
  and p.organizacion_id = (select id from public.organizaciones where nombre = 'Santa Bárbara')
  and p.full_name = 'Sin nombre';

update public.profiles p
set full_name = 'Operario Santa Bárbara'
where p.role = 'operario'
  and p.organizacion_id = (select id from public.organizaciones where nombre = 'Santa Bárbara')
  and p.full_name = 'Sin nombre';
