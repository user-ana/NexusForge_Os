
-- Perfil de cada usuario (espejo de auth.users con rol y datos del juego)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  role           text not null default 'student' check (role in ('student','teacher','visitor')),
  username       text,
  full_name      text,
  career         text,
  account_number text,
  teacher_code   text,
  avatar         text,
  coins          int  not null default 256,
  xp             bigint not null default 0,
  created_at     timestamptz not null default now()
);

-- Si la tabla 'profiles' ya existía de antes, agrega las columnas que falten
alter table public.profiles add column if not exists email          text;
alter table public.profiles add column if not exists role           text not null default 'student';
alter table public.profiles add column if not exists username       text;
alter table public.profiles add column if not exists full_name      text;
alter table public.profiles add column if not exists career         text;
alter table public.profiles add column if not exists account_number text;
alter table public.profiles add column if not exists teacher_code   text;
alter table public.profiles add column if not exists avatar         text;
alter table public.profiles add column if not exists coins          int    not null default 256;
alter table public.profiles add column if not exists xp             bigint not null default 0;

-- Clase / curso (la crea el catedrático)
create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  section      text default '',
  period       text default '',
  code         text not null unique,
  emblem       text,
  teacher_id   uuid not null references auth.users(id) on delete cascade,
  teacher_name text,
  created_at   timestamptz not null default now()
);

-- Inscripción del estudiante a una clase (por código)
create table if not exists public.enrollments (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- Grupos de aula (escuadrones) dentro de una clase
create table if not exists public.class_groups (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  name       text not null,
  icon       text,
  color      text,
  leader_id  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Miembros de cada grupo de aula
create table if not exists public.group_members (
  group_id   uuid not null references public.class_groups(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id, student_id)
);

-- Proyectos (brief/rúbrica) de una clase
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  title        text not null,
  description  text default '',
  objectives   text default '',
  deliverables text default '',
  rubric       jsonb default '[]',
  due_date     text default '',
  team_size    int default 4,
  group_mode   text default 'open',
  leader_mode  text default 'first',
  created_at   timestamptz not null default now()
);

-- Mensajes del chat del aula (canal: 'general' o 'g:<groupId>')
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  channel     text not null,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  author_role text,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Chat de la COMUNIDAD (global, por canal: community/soft/civil/mech/…)
create table if not exists public.community_messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  author_id   uuid references public.profiles(id) on delete set null,
  author_name text,
  author_role text,
  rank        text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cm_channel on public.community_messages(channel, created_at);

-- Avatar (foto) del autor + bandera de editado
alter table public.messages add column if not exists avatar text;
alter table public.messages add column if not exists edited boolean default false;
alter table public.community_messages add column if not exists avatar text;
alter table public.community_messages add column if not exists edited boolean default false;

-- REPLICA IDENTITY FULL → para que los UPDATE/DELETE pasen el filtro en realtime
alter table public.messages replica identity full;
alter table public.community_messages replica identity full;
alter table public.kanban_tasks replica identity full;
alter table public.class_groups replica identity full;
alter table public.group_members replica identity full;
alter table public.enrollments replica identity full;
alter table public.classes replica identity full;
alter table public.projects replica identity full;

-- Tareas del tablero Kanban de cada grupo
create table if not exists public.kanban_tasks (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.class_groups(id) on delete cascade,
  col        text not null default 'todo' check (col in ('todo','doing','done')),
  title      text not null,
  assignee   text,
  created_at timestamptz not null default now()
);

-- Proyecto (showcase) de cada grupo: título, descripción y enlaces del entregable
create table if not exists public.group_projects (
  group_id    uuid primary key references public.class_groups(id) on delete cascade,
  title       text default '',
  description text default '',
  repo_url    text default '',
  deploy_url  text default '',
  video_url   text default '',
  updated_at  timestamptz not null default now()
);
alter table public.group_projects replica identity full;

-- Evaluación del catedrático sobre la entrega de cada grupo (rúbrica + nota + feedback)
-- scores: jsonb { "<índice de criterio>": <puntos otorgados> }
create table if not exists public.group_evaluations (
  group_id       uuid primary key references public.class_groups(id) on delete cascade,
  scores         jsonb not null default '{}'::jsonb,
  feedback       text default '',
  grade          numeric,            -- suma de puntos otorgados
  max_points     numeric,            -- total posible de la rúbrica al momento de evaluar
  graded_by_name text default '',    -- nombre del catedrático que evaluó
  graded_at      timestamptz,
  updated_at     timestamptz not null default now()
);
alter table public.group_evaluations replica identity full;

-- FKs hacia profiles (NO auth.users) para poder embeber el perfil del estudiante
-- (PostgREST necesita la relación enrollments→profiles y group_members→profiles)
alter table public.enrollments drop constraint if exists enrollments_student_id_fkey;
alter table public.enrollments add constraint enrollments_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

alter table public.group_members drop constraint if exists group_members_student_id_fkey;
alter table public.group_members add constraint group_members_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

-- Asignación de proyecto: modalidad por clase + proyecto (enunciado) por grupo
-- project_mode: 'assigned' (el profe asigna) | 'catalog' (eligen de la lista) | 'proposal' (crean el suyo)
alter table public.classes add column if not exists project_mode text default 'catalog';
alter table public.class_groups add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.class_groups add column if not exists archived boolean default false;

-- Parcial (período de evaluación) al que pertenece cada proyecto:
-- '' (sin parcial) | 'p1' (primero) | 'p2' (segundo) | 'p3' (tercero) | 'final'
alter table public.projects add column if not exists parcial text default '';

-- Enlace al enunciado del proyecto (Google Drive / PDF / Overleaf), opcional.
-- Puede ser un link pegado o la URL de un PDF subido a Storage (bucket de abajo).
alter table public.projects add column if not exists brief_url text default '';

-- Storage: bucket público donde se guardan los PDFs de enunciados subidos.
insert into storage.buckets (id, name, public)
values ('project-briefs', 'project-briefs', true)
on conflict (id) do nothing;

drop policy if exists briefs_read on storage.objects;
create policy briefs_read on storage.objects for select to public
  using (bucket_id = 'project-briefs');

drop policy if exists briefs_upload on storage.objects;
create policy briefs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'project-briefs');

create index if not exists idx_enrollments_student on public.enrollments(student_id);
create index if not exists idx_classes_code on public.classes(code);
create index if not exists idx_messages_class_channel on public.messages(class_id, channel);
create index if not exists idx_groups_class on public.class_groups(class_id);

-- ----------------------------------------------------------------------
--  FUNCIONES AUXILIARES (security definer = evitan recursión de RLS)
-- ----------------------------------------------------------------------

create or replace function public.is_class_teacher(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.classes c where c.id = cid and c.teacher_id = auth.uid());
$$;

create or replace function public.is_class_member(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.classes c where c.id = cid and c.teacher_id = auth.uid())
      or exists (select 1 from public.enrollments e where e.class_id = cid and e.student_id = auth.uid());
$$;

create or replace function public.group_class_id(gid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select class_id from public.class_groups where id = gid;
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.student_id = auth.uid());
$$;

-- Extrae de forma segura el UUID del grupo desde un canal 'g:<uuid>' (null si no aplica)
create or replace function public.channel_group_id(ch text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  if ch like 'g:%' then
    return substring(ch from 3)::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- Asigna el proyecto (enunciado) de un grupo. Lo puede hacer un integrante del
-- grupo (al elegir) o el catedrático (al asignar). Valida permisos y que el
-- proyecto sea de la misma clase.
create or replace function public.set_group_project(gid uuid, pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  cid := public.group_class_id(gid);
  if not (public.is_group_member(gid) or public.is_class_teacher(cid)) then
    raise exception 'No autorizado para asignar el proyecto de este grupo';
  end if;
  if pid is not null and not exists (
    select 1 from public.projects p where p.id = pid and p.class_id = cid
  ) then
    raise exception 'El proyecto no pertenece a esta clase';
  end if;
  update public.class_groups set project_id = pid where id = gid;
end;
$$;
grant execute on function public.set_group_project(uuid, uuid) to authenticated;

-- Edita nombre/emblema/color de un grupo (un integrante o el catedrático).
-- Campos vacíos ('') no cambian el valor actual.
create or replace function public.update_group(gid uuid, gname text, gicon text, gcolor text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  cid := public.group_class_id(gid);
  if not (public.is_group_member(gid) or public.is_class_teacher(cid)) then
    raise exception 'No autorizado para editar este grupo';
  end if;
  update public.class_groups set
    name  = coalesce(nullif(btrim(gname), ''), name),
    icon  = coalesce(nullif(gicon, ''), icon),
    color = coalesce(nullif(gcolor, ''), color)
  where id = gid;
end;
$$;
grant execute on function public.update_group(uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------------------
--  TRIGGER: crear/actualizar perfil cuando nace o cambia un usuario
-- ----------------------------------------------------------------------

create or replace function public.handle_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, username, full_name, career, account_number, teacher_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'username',
    coalesce(new.raw_user_meta_data->>'nf_full_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'career',
    new.raw_user_meta_data->>'account_number',
    new.raw_user_meta_data->>'teacher_code'
  )
  on conflict (id) do update set
    email          = excluded.email,
    role           = coalesce(new.raw_user_meta_data->>'role', public.profiles.role),
    username       = coalesce(excluded.username, public.profiles.username),
    full_name      = coalesce(new.raw_user_meta_data->>'nf_full_name', new.raw_user_meta_data->>'full_name', public.profiles.full_name),
    career         = coalesce(excluded.career, public.profiles.career),
    account_number = coalesce(excluded.account_number, public.profiles.account_number),
    teacher_code   = coalesce(excluded.teacher_code, public.profiles.teacher_code);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users for each row execute function public.handle_user();

-- Crea perfiles para usuarios que ya existían antes de este script
insert into public.profiles (id, email, role, username, full_name, account_number, teacher_code)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'role','student'),
       u.raw_user_meta_data->>'username',
       coalesce(u.raw_user_meta_data->>'nf_full_name', u.raw_user_meta_data->>'full_name'),
       u.raw_user_meta_data->>'account_number',
       u.raw_user_meta_data->>'teacher_code'
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------
--  RLS — activar en todas las tablas
-- ----------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.classes      enable row level security;
alter table public.enrollments  enable row level security;
alter table public.class_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.projects     enable row level security;
alter table public.messages     enable row level security;
alter table public.kanban_tasks enable row level security;
alter table public.community_messages enable row level security;
alter table public.group_projects enable row level security;
alter table public.group_evaluations enable row level security;

-- PROFILES: todos (autenticados) pueden leer; cada quien edita el suyo
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- CLASSES: cualquiera autenticado las lee (para unirse por código); el profe gestiona las suyas
drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select to authenticated using (true);
drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated with check (teacher_id = auth.uid());
drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated using (teacher_id = auth.uid());
drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes for delete to authenticated using (teacher_id = auth.uid());

-- ENROLLMENTS: el alumno se inscribe a sí mismo; lectura para miembros de la clase
drop policy if exists enroll_read on public.enrollments;
create policy enroll_read on public.enrollments for select to authenticated using (public.is_class_member(class_id));
drop policy if exists enroll_insert on public.enrollments;
create policy enroll_insert on public.enrollments for insert to authenticated with check (student_id = auth.uid());
drop policy if exists enroll_delete on public.enrollments;
create policy enroll_delete on public.enrollments for delete to authenticated using (student_id = auth.uid() or public.is_class_teacher(class_id));

-- CLASS_GROUPS: leen los miembros de la clase; gestiona el profe
drop policy if exists cg_read on public.class_groups;
create policy cg_read on public.class_groups for select to authenticated using (public.is_class_member(class_id));
drop policy if exists cg_write on public.class_groups;
create policy cg_write on public.class_groups for all to authenticated using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));

-- GROUP_MEMBERS: leen los miembros de la clase; gestiona el profe
drop policy if exists gm_read on public.group_members;
create policy gm_read on public.group_members for select to authenticated using (public.is_class_member(public.group_class_id(group_id)));
drop policy if exists gm_write on public.group_members;
create policy gm_write on public.group_members for all to authenticated using (public.is_class_teacher(public.group_class_id(group_id))) with check (public.is_class_teacher(public.group_class_id(group_id)));

-- PROJECTS: leen los miembros de la clase; gestiona el profe
drop policy if exists proj_read on public.projects;
create policy proj_read on public.projects for select to authenticated using (public.is_class_member(class_id));
drop policy if exists proj_write on public.projects;
create policy proj_write on public.projects for all to authenticated using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));

-- MESSAGES: el canal 'general' es de toda la clase; los canales de grupo 'g:<id>'
-- solo los ven/escriben los integrantes del grupo (o el catedrático).
drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated using (
  case
    when channel like 'g:%'
      then public.is_class_teacher(class_id) or public.is_group_member(public.channel_group_id(channel))
    else public.is_class_member(class_id)
  end
);
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and (
    case
      when channel like 'g:%'
        then public.is_class_teacher(class_id) or public.is_group_member(public.channel_group_id(channel))
      else public.is_class_member(class_id)
    end
  )
);
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages for update to authenticated using (author_id = auth.uid());
drop policy if exists msg_delete on public.messages;
create policy msg_delete on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.is_class_teacher(class_id));

-- GROUP_PROJECTS: privado del escuadrón — leen y editan sus integrantes o el catedrático
drop policy if exists gp_read on public.group_projects;
create policy gp_read on public.group_projects for select to authenticated using (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)));
drop policy if exists gp_write on public.group_projects;
create policy gp_write on public.group_projects for all to authenticated
  using (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)))
  with check (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)));

-- GROUP_EVALUATIONS: la nota del profe. Leen los integrantes del grupo o el catedrático;
-- SOLO el catedrático de la clase puede escribir (el estudiante NO se auto-califica).
drop policy if exists ge_read on public.group_evaluations;
create policy ge_read on public.group_evaluations for select to authenticated
  using (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)));
drop policy if exists ge_write on public.group_evaluations;
create policy ge_write on public.group_evaluations for all to authenticated
  using (public.is_class_teacher(public.group_class_id(group_id)))
  with check (public.is_class_teacher(public.group_class_id(group_id)));

-- KANBAN: privado del escuadrón — leen y editan sus integrantes o el catedrático
drop policy if exists kan_read on public.kanban_tasks;
create policy kan_read on public.kanban_tasks for select to authenticated using (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)));
drop policy if exists kan_write on public.kanban_tasks;
create policy kan_write on public.kanban_tasks for all to authenticated
  using (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)))
  with check (public.is_group_member(group_id) or public.is_class_teacher(public.group_class_id(group_id)));

-- COMMUNITY_MESSAGES: todos los autenticados leen; cada quien escribe como sí mismo
drop policy if exists cm_read on public.community_messages;
create policy cm_read on public.community_messages for select to authenticated using (true);
drop policy if exists cm_insert on public.community_messages;
create policy cm_insert on public.community_messages for insert to authenticated with check (author_id = auth.uid());
drop policy if exists cm_update on public.community_messages;
create policy cm_update on public.community_messages for update to authenticated using (author_id = auth.uid());
drop policy if exists cm_delete on public.community_messages;
create policy cm_delete on public.community_messages for delete to authenticated using (author_id = auth.uid());

-- ----------------------------------------------------------------------
--  GRANTS — el rol 'authenticated' necesita permiso en las tablas (RLS filtra)
-- ----------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
-- y para futuras tablas:
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;

-- EXECUTE en las funciones: Realtime las usa para autorizar la suscripción (policies)
grant execute on all functions in schema public to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- ----------------------------------------------------------------------
--  REALTIME (para chat / kanban / grupos en vivo) — seguro de re-ejecutar
-- ----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages','kanban_tasks','class_groups','group_members','enrollments','classes','projects','community_messages','group_projects','group_evaluations']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;  -- ya estaba agregada
    end;
  end loop;
end $$;

-- La publicación DEBE emitir INSERT + UPDATE + DELETE (si no, las ediciones/borrados no llegan en vivo)
alter publication supabase_realtime set (publish = 'insert,update,delete');

-- Fin del esquema ✅
