-- ======================================================================
--  CALIFICAR ENTREGAS — el catedrático guarda nota y retroalimentación
--
--  La RLS de task_submissions deja que el ALUMNO gestione su fila, pero no el
--  catedrático (por eso no podía calificar). Esta función corre como definer y
--  verifica que quien llama sea el catedrático de la clase de la tarea, y solo
--  entonces escribe grade + feedback. Así el alumno no puede ponerse su nota.
--
--  Idempotente: se puede correr varias veces.
-- ======================================================================

create or replace function public.grade_submission(
  p_task_id uuid, p_student_id uuid, p_grade numeric, p_feedback text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_class_teacher(public.task_class_id(p_task_id)) then
    raise exception 'Solo el catedrático de la clase puede calificar';
  end if;

  update public.task_submissions
     set grade    = p_grade,
         feedback = coalesce(p_feedback, '')
   where task_id = p_task_id and student_id = p_student_id;

  -- Aviso al alumno de que ya tiene nota
  insert into public.notifications (user_id, type, title, body, link, class_id)
  select p_student_id,
         'graded',
         'Tu tarea fue calificada',
         'Revisa la retroalimentación de tu catedrático.',
         '/dashboard/tasks/' || p_task_id,
         public.task_class_id(p_task_id);
end;
$$;
grant execute on function public.grade_submission(uuid, uuid, numeric, text) to authenticated;

-- Fin del parche de calificación
