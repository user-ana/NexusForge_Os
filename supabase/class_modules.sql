-- ======================================================================
--  MÓDULOS DE APRENDIZAJE (material semanal del catedrático)
--
--  Qué agrega:
--    - class_modules : la unidad de material que el catedrático arma para su
--                      clase (tema de la semana o del parcial). Nace OCULTO:
--                      lo prepara con calma y lo publica cuando toca.
--    - module_files  : los archivos de cada módulo (PDF, presentación, enlace).
--                      Guarda además el TEXTO extraído del PDF, que es lo que
--                      después leerá la IA para explicarle la clase al alumno.
--
--  Idea clave: igual que en las tareas, publicar es una sola función
--  (publish_module) que cambia la visibilidad Y avisa a cada inscrito.
--
--  Cómo se corre: pegar todo esto en el SQL Editor de Supabase y ejecutar.
--  Es idempotente (se puede correr varias veces sin problema).
-- ======================================================================

-- ----------------------------------------------------------------------
--  1) TABLAS
-- ----------------------------------------------------------------------

-- Módulo de una clase (semana / tema). published=false -> solo lo ve el catedrático.
create table if not exists public.class_modules (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  title           text not null,
  description     text default '',
  parcial         text default '',        -- '' | p1 | p2 | p3 | final
  week            int,                    -- número de semana (null = sin semana)
  published       boolean not null default false,
  published_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_by_name text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_cm_class on public.class_modules(class_id, week, created_at desc);
alter table public.class_modules replica identity full;

-- Archivos del módulo. text_content = texto extraído del PDF en el navegador,
-- para que la IA pueda apoyarse en el material real del catedrático.
create table if not exists public.module_files (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid not null references public.class_modules(id) on delete cascade,
  name         text not null,
  url          text not null,
  kind         text not null default 'other', -- pdf | slides | doc | link | other
  size_bytes   bigint default 0,
  text_content text default '',
  created_at   timestamptz not null default now()
);
create index if not exists idx_mf_module on public.module_files(module_id, created_at);
alter table public.module_files replica identity full;

-- ----------------------------------------------------------------------
--  2) FUNCIONES AUXILIARES (security definer = evitan recursión de RLS)
-- ----------------------------------------------------------------------

-- ¿Puedo VER este módulo? El catedrático siempre; el alumno solo si está publicado.
create or replace function public.can_see_module(mid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.class_modules m
    where m.id = mid
      and (public.is_class_teacher(m.class_id)
           or (m.published and public.is_class_member(m.class_id)))
  );
$$;

-- ¿Puedo EDITAR este módulo? Solo el catedrático de su clase.
create or replace function public.can_edit_module(mid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.class_modules m
    where m.id = mid and public.is_class_teacher(m.class_id)
  );
$$;

-- ----------------------------------------------------------------------
--  3) RLS
-- ----------------------------------------------------------------------
alter table public.class_modules enable row level security;
alter table public.module_files  enable row level security;

-- CLASS_MODULES: el catedrático ve y gestiona todos los suyos (publicados o no);
-- el alumno inscrito solo ve los publicados.
drop policy if exists cm_read on public.class_modules;
create policy cm_read on public.class_modules for select to authenticated
  using (
    public.is_class_teacher(class_id)
    or (published and public.is_class_member(class_id))
  );
drop policy if exists cm_write on public.class_modules;
create policy cm_write on public.class_modules for all to authenticated
  using (public.is_class_teacher(class_id))
  with check (public.is_class_teacher(class_id));

-- MODULE_FILES: heredan la visibilidad de su módulo.
drop policy if exists mf_read on public.module_files;
create policy mf_read on public.module_files for select to authenticated
  using (public.can_see_module(module_id));
drop policy if exists mf_write on public.module_files;
create policy mf_write on public.module_files for all to authenticated
  using (public.can_edit_module(module_id))
  with check (public.can_edit_module(module_id));

-- ----------------------------------------------------------------------
--  4) RPC: publicar / ocultar un módulo
--     Publicar avisa a cada alumno inscrito (misma idea que create_class_task).
-- ----------------------------------------------------------------------
create or replace function public.publish_module(mid uuid, pub boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  m     public.class_modules;
  cname text;
begin
  select * into m from public.class_modules where id = mid;
  if not found then
    raise exception 'El módulo no existe';
  end if;
  if not public.is_class_teacher(m.class_id) then
    raise exception 'Solo el catedrático de la clase puede publicar módulos';
  end if;

  update public.class_modules
     set published    = pub,
         published_at = case when pub then now() else null end,
         updated_at   = now()
   where id = mid;

  -- Solo se notifica al PUBLICAR, y solo la primera vez (si ya se había
  -- publicado antes, ocultarlo y volverlo a mostrar no vuelve a molestar).
  if pub and m.published_at is null then
    select name into cname from public.classes where id = m.class_id;
    insert into public.notifications (user_id, type, title, body, link, class_id)
    select e.student_id,
           'module_new',
           'Nuevo material: ' || m.title,
           coalesce(cname, 'Tu clase')
             || case when m.week is not null then ' — Semana ' || m.week else '' end,
           '/dashboard/classes/' || m.class_id,
           m.class_id
    from public.enrollments e
    where e.class_id = m.class_id;
  end if;
end;
$$;
grant execute on function public.publish_module(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------
--  5) PERMISOS DE TABLA (RLS decide las filas; esto da el permiso base)
-- ----------------------------------------------------------------------
grant select, insert, update, delete
  on public.class_modules, public.module_files
  to authenticated;
grant all
  on public.class_modules, public.module_files
  to service_role;

-- ----------------------------------------------------------------------
--  6) REALTIME (el material aparece en vivo al publicarlo)
-- ----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['class_modules', 'module_files']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;  -- ya estaba agregada
    end;
  end loop;
end $$;

-- Fin del parche de módulos de aprendizaje
