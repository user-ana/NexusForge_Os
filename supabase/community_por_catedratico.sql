-- ======================================================================
--  COMUNIDAD POR CATEDRÁTICO
--
--  Antes la comunidad era GLOBAL: cualquier persona autenticada leía TODOS
--  los mensajes (política `using (true)`), sin importar de qué clase o
--  catedrático viniera. Eso significaba que un catedrático nuevo, o un
--  estudiante recién llegado, entraba y veía conversaciones ajenas.
--
--  Ahora cada catedrático tiene SU comunidad:
--    - El catedrático ve y escribe en la suya.
--    - El estudiante ve la de los catedráticos de las clases donde está
--      inscrito, y en ninguna otra.
--    - Quien entra por primera vez arranca con la comunidad vacía.
--
--  Idempotente: se puede correr varias veces.
-- ======================================================================

-- A qué ecosistema (catedrático) pertenece cada mensaje
alter table public.community_messages
  add column if not exists teacher_id uuid references public.profiles(id) on delete cascade;

create index if not exists idx_cm_teacher
  on public.community_messages(teacher_id, channel, created_at);

-- ¿Comparto ecosistema con ese catedrático?
-- (security definer para no chocar con la RLS de classes/enrollments)
create or replace function public.shares_teacher(tid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select tid = auth.uid()
      or exists (
        select 1
        from public.classes c
        join public.enrollments e on e.class_id = c.id
        where c.teacher_id = tid
          and e.student_id = auth.uid()
      );
$$;
grant execute on function public.shares_teacher(uuid) to authenticated;

-- Lectura: solo la comunidad de un catedrático con el que comparto clases.
-- Los mensajes viejos (sin catedrático) quedan fuera: nadie los ve.
drop policy if exists cm_read on public.community_messages;
create policy cm_read on public.community_messages for select to authenticated
  using (teacher_id is not null and public.shares_teacher(teacher_id));

-- Escritura: como uno mismo y solo en una comunidad a la que pertenezco
drop policy if exists cm_insert on public.community_messages;
create policy cm_insert on public.community_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and teacher_id is not null
    and public.shares_teacher(teacher_id)
  );

-- Editar/borrar: sigue siendo solo lo propio
drop policy if exists cm_update on public.community_messages;
create policy cm_update on public.community_messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists cm_delete on public.community_messages;
create policy cm_delete on public.community_messages for delete to authenticated
  using (author_id = auth.uid());

-- OPCIONAL: borrar los mensajes globales viejos (ya no los ve nadie).
-- Descomenta si quieres limpiarlos de la base:
-- delete from public.community_messages where teacher_id is null;
