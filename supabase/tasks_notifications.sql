-- ======================================================================
--  TAREAS DE CLASE + NOTIFICACIONES + "MIS TAREAS"
--
--  Qué agrega:
--    - class_tasks       : la tarea que el catedrático publica a toda la clase
--                          (título, descripción, parcial, fecha límite, link).
--    - task_submissions  : la entrega/estado de cada estudiante por tarea.
--                          Si NO hay fila para un alumno -> la tarea está pendiente.
--    - notifications     : la bandeja de cada usuario (campanita).
--
--  Idea clave: al publicar una tarea, una sola función (create_class_task)
--  crea la tarea Y reparte una notificación a cada estudiante inscrito. El
--  navegador no necesita leer la lista de alumnos.
--
--  Cómo se corre: pegar todo esto en el SQL Editor de Supabase y ejecutar.
--  Es idempotente (se puede correr varias veces sin problema).
-- ======================================================================

-- ----------------------------------------------------------------------
--  1) TABLAS
-- ----------------------------------------------------------------------

-- Tarea publicada por el catedrático a TODA la clase (no por grupo)
create table if not exists public.class_tasks (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  title           text not null,
  description     text default '',
  parcial         text default '',        -- '' | p1 | p2 | p3 | final
  link_url        text default '',        -- enunciado / recurso opcional
  due_date        timestamptz,            -- null = sin fecha límite
  created_by      uuid references public.profiles(id) on delete set null,
  created_by_name text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_ct_class on public.class_tasks(class_id, created_at desc);
alter table public.class_tasks replica identity full;

-- Entrega/estado de cada estudiante por tarea.
-- La AUSENCIA de fila = tarea pendiente. La presencia de fila = entregada.
create table if not exists public.task_submissions (
  task_id      uuid not null references public.class_tasks(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  note         text default '',           -- comentario del alumno al entregar
  link_url     text default '',           -- link del alumno (repo, doc...) opcional
  submitted_at timestamptz not null default now(),
  grade        numeric,                   -- (para calificación futura del profe)
  feedback     text default '',           -- (para retroalimentación futura)
  primary key (task_id, student_id)
);
alter table public.task_submissions replica identity full;

-- Bandeja de notificaciones por usuario (la campanita)
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'info', -- task_new | task_due | graded | info
  title      text not null,
  body       text default '',
  link       text default '',
  class_id   uuid references public.classes(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, read, created_at desc);
alter table public.notifications replica identity full;

-- ----------------------------------------------------------------------
--  2) FUNCIÓN AUXILIAR: clase a la que pertenece una tarea
--     (security definer = evita recursión de RLS, igual que tus otras)
-- ----------------------------------------------------------------------
create or replace function public.task_class_id(tid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select class_id from public.class_tasks where id = tid;
$$;

-- ----------------------------------------------------------------------
--  3) RLS
-- ----------------------------------------------------------------------
alter table public.class_tasks      enable row level security;
alter table public.task_submissions enable row level security;
alter table public.notifications    enable row level security;

-- CLASS_TASKS: la lee cualquier miembro de la clase; la gestiona el catedrático
drop policy if exists ct_read on public.class_tasks;
create policy ct_read on public.class_tasks for select to authenticated
  using (public.is_class_member(class_id));
drop policy if exists ct_write on public.class_tasks;
create policy ct_write on public.class_tasks for all to authenticated
  using (public.is_class_teacher(class_id))
  with check (public.is_class_teacher(class_id));

-- TASK_SUBMISSIONS: el estudiante gestiona SOLO la suya; el catedrático las lee todas
drop policy if exists ts_read on public.task_submissions;
create policy ts_read on public.task_submissions for select to authenticated
  using (student_id = auth.uid() or public.is_class_teacher(public.task_class_id(task_id)));
drop policy if exists ts_insert on public.task_submissions;
create policy ts_insert on public.task_submissions for insert to authenticated
  with check (student_id = auth.uid() and public.is_class_member(public.task_class_id(task_id)));
drop policy if exists ts_update on public.task_submissions;
create policy ts_update on public.task_submissions for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists ts_delete on public.task_submissions;
create policy ts_delete on public.task_submissions for delete to authenticated
  using (student_id = auth.uid());

-- NOTIFICATIONS: cada quien ve/marca/borra SOLO las suyas.
-- No hay policy de INSERT directo: se crean únicamente vía create_class_task
-- (security definer), para que nadie pueda mandarle notificaciones a otro.
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------
--  4) RPC: publicar una tarea Y notificar a cada alumno, en una operación
-- ----------------------------------------------------------------------
create or replace function public.create_class_task(
  cid uuid, ptitle text, pdesc text, pparcial text, plink text, pdue timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  tname  text;
  cname  text;
  venc   text;
begin
  if not public.is_class_teacher(cid) then
    raise exception 'Solo el catedrático de la clase puede publicar tareas';
  end if;
  if btrim(coalesce(ptitle, '')) = '' then
    raise exception 'La tarea necesita un título';
  end if;

  select coalesce(nullif(btrim(full_name), ''), username, 'Catedrático')
    into tname from public.profiles where id = auth.uid();
  select name into cname from public.classes where id = cid;

  insert into public.class_tasks
    (class_id, title, description, parcial, link_url, due_date, created_by, created_by_name)
  values
    (cid, btrim(ptitle), coalesce(pdesc, ''), coalesce(pparcial, ''),
     coalesce(plink, ''), pdue, auth.uid(), tname)
  returning id into new_id;

  venc := case when pdue is null then 'sin fecha límite'
               else 'vence el ' || to_char(pdue, 'DD/MM a las HH24:MI') end;

  -- Una notificación por cada estudiante inscrito en la clase
  insert into public.notifications (user_id, type, title, body, link, class_id)
  select e.student_id,
         'task_new',
         'Nueva tarea: ' || btrim(ptitle),
         coalesce(cname, 'Tu clase') || ' — ' || venc,
         '/dashboard/tasks',
         cid
  from public.enrollments e
  where e.class_id = cid;

  return new_id;
end;
$$;
grant execute on function public.create_class_task(uuid, text, text, text, text, timestamptz) to authenticated;

-- Marcar todas mis notificaciones como leídas de una sola vez
create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read = true
  where user_id = auth.uid() and read = false;
$$;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ----------------------------------------------------------------------
--  5) PERMISOS DE TABLA (RLS decide las filas; esto da el permiso base)
-- ----------------------------------------------------------------------
grant select, insert, update, delete
  on public.class_tasks, public.task_submissions, public.notifications
  to authenticated;
grant all
  on public.class_tasks, public.task_submissions, public.notifications
  to service_role;

-- ----------------------------------------------------------------------
--  6) REALTIME (la campanita y las tareas se actualizan en vivo)
-- ----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['class_tasks', 'task_submissions', 'notifications']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;  -- ya estaba agregada
    end;
  end loop;
end $$;

-- Fin del parche de tareas + notificaciones
