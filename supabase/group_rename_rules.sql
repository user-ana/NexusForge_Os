-- ======================================================================
--  RENOMBRAR SALA: solo el líder + sin nombres duplicados
--
--  Antes update_group dejaba que CUALQUIER integrante cambiara el nombre, y
--  no comprobaba duplicados (por eso podían quedar dos "Sala 1"). Ahora:
--    - El nombre solo lo cambian el LÍDER de la sala o el catedrático.
--    - No se permite un nombre que ya use otra sala de la misma clase.
--    - El ícono y el color los puede cambiar cualquier integrante.
--
--  La comprobación vive en la base (no solo en la app): aunque alguien
--  manipule el cliente, la regla se cumple. Es idempotente.
-- ======================================================================
create or replace function public.update_group(gid uuid, gname text, gicon text, gcolor text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cid       uuid;
  is_leader boolean;
  is_teach  boolean;
  cur_name  text;
  new_name  text;
begin
  cid := public.group_class_id(gid);

  -- Debe ser integrante o catedrático para tocar la sala
  if not (public.is_group_member(gid) or public.is_class_teacher(cid)) then
    raise exception 'No autorizado para editar este grupo';
  end if;

  is_teach := public.is_class_teacher(cid);
  select (leader_id = auth.uid()), name into is_leader, cur_name
    from public.class_groups where id = gid;

  new_name := nullif(btrim(gname), '');

  -- ¿Se está intentando cambiar el nombre?
  if new_name is not null and lower(new_name) <> lower(coalesce(cur_name, '')) then
    -- Solo el líder o el catedrático pueden renombrar
    if not (coalesce(is_leader, false) or is_teach) then
      raise exception 'Solo el líder puede cambiar el nombre de la sala' using errcode = 'P0001';
    end if;
    -- El nombre no puede repetirse dentro de la misma clase
    if exists (
      select 1 from public.class_groups g
      where g.class_id = cid and g.id <> gid and lower(btrim(g.name)) = lower(new_name)
    ) then
      raise exception 'Ya existe una sala con ese nombre en la clase' using errcode = 'P0002';
    end if;
  else
    -- No cambia el nombre: se conserva el actual
    new_name := cur_name;
  end if;

  update public.class_groups set
    name  = coalesce(new_name, name),
    icon  = coalesce(nullif(gicon, ''), icon),
    color = coalesce(nullif(gcolor, ''), color)
  where id = gid;
end;
$$;
grant execute on function public.update_group(uuid, text, text, text) to authenticated;
