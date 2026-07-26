-- ======================================================================
--  HISTORIAL DEL ASISTENTE / TUTOR — conversaciones por sesión
--
--  Antes las respuestas del tutor vivían sueltas en tutor_messages y "Reiniciar"
--  las borraba para siempre. Ahora cada conversación es una SESIÓN:
--    - tutor_sessions : una charla con el asistente, atada a un módulo (y por él
--                       a una clase y un parcial). Reiniciar no borra: ARCHIVA la
--                       sesión y abre una nueva. El historial queda.
--    - tutor_messages : ahora cada mensaje pertenece a una sesión, y recuerda si
--                       esa respuesta ya se PUBLICÓ como tarea (published).
--
--  Todo es privado de cada usuario (RLS). Clasificable por clase y parcial.
--
--  Idempotente: se puede correr varias veces. Incluye backfill de lo viejo.
-- ======================================================================

-- ----------------------------------------------------------------------
--  1) SESIONES
-- ----------------------------------------------------------------------
create table if not exists public.tutor_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module_id  uuid not null references public.class_modules(id) on delete cascade,
  class_id   uuid references public.classes(id) on delete cascade,
  parcial    text default '',
  role       text not null default 'student',   -- con qué rol se abrió (tutor vs cátedra)
  title      text default '',                   -- se llena con la primera pregunta
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ts_user_mod on public.tutor_sessions(user_id, module_id, archived, updated_at desc);
create index if not exists idx_ts_user_class on public.tutor_sessions(user_id, class_id, updated_at desc);

-- ----------------------------------------------------------------------
--  2) MENSAJES: enlazarlos a la sesión + marca de publicado
-- ----------------------------------------------------------------------
alter table public.tutor_messages add column if not exists session_id uuid references public.tutor_sessions(id) on delete cascade;
alter table public.tutor_messages add column if not exists published boolean not null default false;
create index if not exists idx_tm_session on public.tutor_messages(session_id, created_at);

-- ----------------------------------------------------------------------
--  3) BACKFILL: una sesión por cada (usuario, módulo) que ya tenía chats
-- ----------------------------------------------------------------------
do $$
declare r record; sid uuid;
begin
  for r in
    select distinct user_id, module_id
    from public.tutor_messages
    where session_id is null
  loop
    insert into public.tutor_sessions (user_id, module_id, class_id, parcial)
    select r.user_id, r.module_id, m.class_id, coalesce(m.parcial, '')
    from public.class_modules m where m.id = r.module_id
    returning id into sid;

    if sid is not null then
      update public.tutor_messages
        set session_id = sid
        where user_id = r.user_id and module_id = r.module_id and session_id is null;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------
--  4) RLS — cada quien gestiona SOLO lo suyo
-- ----------------------------------------------------------------------
alter table public.tutor_sessions enable row level security;

drop policy if exists tsess_all on public.tutor_sessions;
create policy tsess_all on public.tutor_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- (tutor_messages ya tenía su policy user_id = auth.uid() del parche anterior)

grant select, insert, update, delete on public.tutor_sessions to authenticated;
grant all on public.tutor_sessions to service_role;

-- ----------------------------------------------------------------------
--  5) TÍTULO AUTOMÁTICO: al llegar el primer mensaje de la sesión
-- ----------------------------------------------------------------------
create or replace function public.tutor_session_title()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'user' and new.session_id is not null then
    update public.tutor_sessions s
      set title = case when coalesce(btrim(s.title), '') = ''
                       then left(new.content, 80) else s.title end,
          updated_at = now()
    where s.id = new.session_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tutor_title on public.tutor_messages;
create trigger trg_tutor_title after insert on public.tutor_messages
  for each row execute function public.tutor_session_title();

-- Fin del parche de historial del asistente
