-- ======================================================================
--  PARCHE DE SEGURIDAD — Escalada de privilegios (rol de catedrático)
--
--  Qué arregla:
--    Antes, el rol del perfil salía de raw_user_meta_data, que el propio
--    usuario puede editar desde el navegador con supabase.auth.updateUser().
--    Es decir: cualquier estudiante podía convertirse en catedrático con una
--    sola línea en la consola del navegador. Además la política de RLS
--    (id = auth.uid()) permite editar la propia fila entera, incluida la
--    columna role, porque RLS filtra FILAS, no COLUMNAS.
--
--  Cómo lo arregla:
--    1) handle_user(): todo perfil nuevo nace como 'student' y el trigger
--       nunca vuelve a tocar la columna role.
--    2) protect_profile_role(): revierte cualquier cambio de rol que no venga
--       del servidor (service_role), que es quien valida la clave docente en
--       /api/verify-teacher-key con límite de intentos.
--
--  Cómo se corre: pegar todo esto en el SQL Editor de Supabase y ejecutar.
--  Es idempotente (se puede correr varias veces sin problema).
-- ======================================================================

-- 1) El trigger de alta/actualización de usuario ya no hereda el rol
create or replace function public.handle_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, username, full_name, career, account_number, teacher_code)
  values (
    new.id,
    new.email,
    'student',                              -- nunca se hereda el rol del metadata
    new.raw_user_meta_data->>'username',
    coalesce(new.raw_user_meta_data->>'nf_full_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'career',
    new.raw_user_meta_data->>'account_number',
    new.raw_user_meta_data->>'teacher_code'
  )
  on conflict (id) do update set
    email          = excluded.email,
    -- el rol NO se toca aquí (lo protege protect_profile_role)
    username       = coalesce(excluded.username, public.profiles.username),
    full_name      = coalesce(new.raw_user_meta_data->>'nf_full_name', new.raw_user_meta_data->>'full_name', public.profiles.full_name),
    career         = coalesce(excluded.career, public.profiles.career),
    account_number = coalesce(excluded.account_number, public.profiles.account_number),
    teacher_code   = coalesce(excluded.teacher_code, public.profiles.teacher_code);
  return new;
end;
$$;

-- 2) Candado a nivel de columna: solo el servidor puede cambiar el rol
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    new.role := old.role;   -- se ignora el intento, en silencio
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_trg on public.profiles;
create trigger protect_profile_role_trg
  before update on public.profiles for each row execute function public.protect_profile_role();

-- ----------------------------------------------------------------------
--  COMPROBACIÓN (opcional): ver quién tiene rol de catedrático hoy.
--  Si aparece alguien que no debería, corregirlo aquí (esto corre como
--  dueño de la base, así que sí puede cambiar el rol).
-- ----------------------------------------------------------------------
-- select id, email, role from public.profiles where role = 'teacher';
-- update public.profiles set role = 'student' where email = 'correo@ejemplo.com';
