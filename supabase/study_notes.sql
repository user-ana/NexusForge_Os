-- ======================================================================
--  APUNTES DEL ESTUDIANTE + HISTORIAL DEL TUTOR
--
--  Qué agrega:
--    - study_notes    : lo que el estudiante guarda mientras estudia, sea
--                       escrito por él o rescatado de una respuesta del tutor.
--    - tutor_messages : la conversación con el tutor, para que al volver a
--                       abrir la lección siga donde la dejó y pueda releerla.
--
--  Ambas son PRIVADAS: cada quien ve solo lo suyo, ni siquiera el catedrático
--  las lee. Estudiar es un espacio propio; si el alumno supiera que su profe
--  ve cada duda que preguntó, dejaría de preguntar.
--
--  Cómo se corre: pegar todo esto en el SQL Editor de Supabase y ejecutar.
--  Es idempotente (se puede correr varias veces sin problema).
-- ======================================================================

-- ----------------------------------------------------------------------
--  1) TABLAS
-- ----------------------------------------------------------------------

-- Apunte del estudiante sobre un módulo.
-- source: 'tutor' (rescatado de una respuesta) | 'propio' (lo escribió él)
create table if not exists public.study_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module_id  uuid not null references public.class_modules(id) on delete cascade,
  class_id   uuid references public.classes(id) on delete cascade,
  content    text not null,
  source     text not null default 'propio',
  created_at timestamptz not null default now()
);
create index if not exists idx_sn_user on public.study_notes(user_id, created_at desc);
create index if not exists idx_sn_module on public.study_notes(module_id, user_id);
alter table public.study_notes replica identity full;

-- Conversación con el tutor, por módulo y por estudiante.
create table if not exists public.tutor_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module_id  uuid not null references public.class_modules(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tm_user_module on public.tutor_messages(user_id, module_id, created_at);
alter table public.tutor_messages replica identity full;

-- ----------------------------------------------------------------------
--  2) RLS — cada usuario gestiona SOLO lo suyo
-- ----------------------------------------------------------------------
alter table public.study_notes    enable row level security;
alter table public.tutor_messages enable row level security;

drop policy if exists sn_all on public.study_notes;
create policy sn_all on public.study_notes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tm_all on public.tutor_messages;
create policy tm_all on public.tutor_messages for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------
--  3) PERMISOS DE TABLA (RLS decide las filas; esto da el permiso base)
-- ----------------------------------------------------------------------
grant select, insert, update, delete
  on public.study_notes, public.tutor_messages
  to authenticated;
grant all
  on public.study_notes, public.tutor_messages
  to service_role;

-- ----------------------------------------------------------------------
--  4) REALTIME (los apuntes aparecen al instante entre pestañas)
-- ----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['study_notes', 'tutor_messages']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;  -- ya estaba agregada
    end;
  end loop;
end $$;

-- Fin del parche de apuntes e historial
