-- ======================================================================
--  CANDADO DE ROL — solo un catedratico puede crear clases
-- ======================================================================
--
--  EL PROBLEMA
--
--  La politica original de insercion en `classes` era:
--
--      with check (teacher_id = auth.uid())
--
--  Comprueba que no te pongas a OTRO como catedratico, pero no comprueba que
--  TU seas catedratico. Cualquier usuario autenticado — un estudiante, un
--  visitante — podia crear una clase poniendose como docente.
--
--  Y eso no se queda ahi: en cuanto la clase existe, esa persona ES el
--  catedratico de esa clase, asi que is_class_teacher() le devuelve verdadero
--  y las demas politicas (cg_write, proj_write, ct_write) le abren la puerta
--  a crear grupos, proyectos y publicar tareas. Repartiendo el codigo de la
--  clase podria matricular estudiantes reales y mandarles notificaciones
--  haciendose pasar por docente.
--
--  POR QUE SE ARREGLA AQUI Y NO EN LA INTERFAZ
--
--  Esconder el boton no sirve: la llave publica (anon) viaja en el navegador
--  por diseño, asi que cualquiera puede llamar a la API de Supabase a mano.
--  La unica frontera que no se puede saltar desde el cliente es RLS.
--
--  Ejecutar en el editor SQL de Supabase, despues de schema.sql.
-- ======================================================================

-- ----------------------------------------------------------------------
--  Quien es catedratico. security definer para poder leer profiles sin que
--  las politicas de esa tabla interfieran; stable porque no cambia dentro
--  de una misma consulta.
-- ----------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher');
$$;

grant execute on function public.is_teacher() to authenticated, service_role;

-- ----------------------------------------------------------------------
--  La correccion
-- ----------------------------------------------------------------------
drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_teacher());

-- Actualizar tampoco: sin esto, un estudiante que ya hubiera creado una clase
-- antes del parche podria seguir editandola.
drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());

-- Borrar SI se le permite aunque ya no sea catedratico: si quedaron clases
-- creadas por un estudiante antes del parche, que pueda limpiarlas.
-- (La politica classes_delete original se mantiene tal cual.)

-- ----------------------------------------------------------------------
--  DIAGNOSTICO — ¿alguien aprovecho el hueco antes del parche?
--  Lista las clases cuyo "catedratico" no tiene el rol de catedratico.
--  Deberia salir vacio. Si sale algo, revisalo con calma antes de borrar:
--  puede haber estudiantes matriculados de verdad en esas clases.
-- ----------------------------------------------------------------------
select
  c.id,
  c.name        as clase,
  c.code        as codigo,
  p.email       as creada_por,
  p.role        as rol_real,
  c.created_at,
  (select count(*) from public.enrollments e where e.class_id = c.id) as estudiantes_matriculados
from public.classes c
join public.profiles p on p.id = c.teacher_id
where p.role <> 'teacher'
order by c.created_at desc;
