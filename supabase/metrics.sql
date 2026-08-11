-- ======================================================================
--  MONITOREO DE METRICAS Y RENDIMIENTO   (Tercer Parcial: Mantenimiento)
--
--  Guarda en una sola tabla las cuatro familias de senales que necesita el
--  panel de monitoreo:
--
--    kind = 'web_vital'  Core Web Vitals medidos en el NAVEGADOR del usuario
--                        (LCP, CLS, INP, FCP, TTFB). Rendimiento percibido.
--    kind = 'api'        Duracion y codigo de estado de cada llamada a la API
--                        del servidor. Rendimiento del backend.
--    kind = 'error'      Fallos no controlados del servidor.
--    kind = 'event'      Uso (por ahora 'pageview').
--
--  Una sola tabla en vez de cuatro: las consultas del panel son siempre
--  "agrega por rango de tiempo", el volumen es bajo y asi hay un unico punto
--  de retencion (ver metrics_prune).
--
--  Ejecutar en el editor SQL de Supabase DESPUES de schema.sql.
-- ======================================================================

create table if not exists public.app_metrics (
  id      bigserial   primary key,
  ts      timestamptz not null default now(),
  kind    text        not null check (kind in ('web_vital', 'api', 'error', 'event')),
  name    text        not null,               -- 'LCP' | 'POST' | 'unhandled' | 'pageview'
  value   numeric     not null default 0,     -- ms (o score sin unidad en CLS)
  route   text        not null default '',    -- ruta normalizada: /dashboard/classes/[id]
  status  int,                                -- codigo HTTP (solo kind='api')
  user_id uuid        references auth.users(id) on delete set null,
  role    text        not null default '',
  meta    jsonb       not null default '{}'::jsonb
);

-- Indices: el panel siempre filtra por ventana de tiempo y luego agrupa.
create index if not exists idx_metrics_ts       on public.app_metrics (ts desc);
create index if not exists idx_metrics_kind_ts  on public.app_metrics (kind, ts desc);
create index if not exists idx_metrics_route_ts on public.app_metrics (route, ts desc);
create index if not exists idx_metrics_name_ts  on public.app_metrics (name, ts desc);

-- ----------------------------------------------------------------------
--  Quien es catedratico (se reutiliza en las politicas de esta tabla)
-- ----------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher');
$$;

-- ----------------------------------------------------------------------
--  SEGURIDAD
--   - Leer: solo catedraticos (el panel de monitoreo es vista docente).
--   - Escribir: NADIE desde el navegador. Las metricas entran por
--     /api/metrics, que valida y escribe con la llave del servidor
--     (service_role, que se salta RLS). Asi nadie puede inyectar datos
--     falsos ni inflar el panel desde la consola del navegador.
-- ----------------------------------------------------------------------
alter table public.app_metrics enable row level security;

drop policy if exists am_read on public.app_metrics;
create policy am_read on public.app_metrics for select to authenticated
  using (public.is_teacher());

revoke insert, update, delete on public.app_metrics from authenticated, anon;
grant select on public.app_metrics to authenticated;
grant all    on public.app_metrics to service_role;
grant usage, select on sequence public.app_metrics_id_seq to service_role;

-- ----------------------------------------------------------------------
--  RESUMEN PARA EL PANEL
--
--  Devuelve TODO el panel en un solo jsonb (una sola ida a la base):
--  percentiles de Web Vitals, latencia y errores de API, rutas mas lentas,
--  serie temporal para las graficas, ultimos errores y uso de la plataforma.
--
--  Se usa percentil 75 / 95 y no el promedio: el promedio esconde a los
--  usuarios con conexion lenta, que son justo los que hay que vigilar.
-- ----------------------------------------------------------------------
create or replace function public.metrics_overview(p_hours int default 24)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_hours int         := greatest(1, least(coalesce(p_hours, 24), 720));
  v_from  timestamptz := now() - make_interval(hours => v_hours);
  -- Ancho del intervalo de la grafica segun el rango pedido:
  -- hasta 3 h -> 5 min | hasta 48 h -> 1 h | mas -> 1 dia
  v_step  int         := case when v_hours <= 3 then 300 when v_hours <= 48 then 3600 else 86400 end;
  v_out   jsonb;
begin
  with m as (
    select * from public.app_metrics where ts >= v_from
  ),
  vitals as (
    select
      name,
      count(*)::int as samples,
      round((percentile_cont(0.50) within group (order by value::double precision))::numeric, 2) as p50,
      round((percentile_cont(0.75) within group (order by value::double precision))::numeric, 2) as p75,
      round((percentile_cont(0.95) within group (order by value::double precision))::numeric, 2) as p95
    from m
    where kind = 'web_vital'
    group by name
  ),
  api as (
    select
      count(*)::int                                as requests,
      (count(*) filter (where status >= 400))::int as errors,
      coalesce(round((percentile_cont(0.50) within group (order by value::double precision))::numeric, 1), 0) as p50,
      coalesce(round((percentile_cont(0.95) within group (order by value::double precision))::numeric, 1), 0) as p95,
      coalesce(round(avg(value), 1), 0)            as avg
    from m
    where kind = 'api'
  ),
  routes as (
    select
      route,
      count(*)::int                                as requests,
      (count(*) filter (where status >= 400))::int as errors,
      round(avg(value), 1)                         as avg,
      round((percentile_cont(0.95) within group (order by value::double precision))::numeric, 1) as p95,
      round(max(value), 1)                         as max
    from m
    where kind = 'api' and route <> ''
    group by route
    order by p95 desc nulls last
    limit 10
  ),
  -- Rejilla completa de intervalos para que la grafica no salte los huecos sin trafico
  buckets as (
    select generate_series(
      to_timestamp((floor(extract(epoch from v_from) / v_step) * v_step)::double precision),
      to_timestamp((floor(extract(epoch from now())  / v_step) * v_step)::double precision),
      make_interval(secs => v_step::double precision)
    ) as t
  ),
  agg as (
    select
      to_timestamp((floor(extract(epoch from ts) / v_step) * v_step)::double precision) as t,
      (count(*) filter (where kind = 'api'))::int                        as requests,
      (count(*) filter (where kind = 'api' and status >= 400))::int      as errors,
      (count(*) filter (where kind = 'event' and name = 'pageview'))::int as pageviews,
      round(avg(value) filter (where kind = 'api'), 1)                   as avg_ms
    from m
    group by 1
  ),
  series as (
    select
      b.t,
      coalesce(a.requests, 0)  as requests,
      coalesce(a.errors, 0)    as errors,
      coalesce(a.pageviews, 0) as pageviews,
      coalesce(a.avg_ms, 0)    as avg_ms
    from buckets b
    left join agg a on a.t = b.t
  ),
  errs as (
    select ts, name, route, status, meta
    from m
    where kind = 'error' or (kind = 'api' and status >= 400)
    order by ts desc
    limit 12
  ),
  traffic as (
    select
      (count(*) filter (where kind = 'event' and name = 'pageview'))::int as pageviews,
      (count(distinct user_id))::int                                      as active_users
    from m
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'hours', v_hours, 'from', v_from, 'to', now(), 'step_seconds', v_step
    ),
    'vitals',  coalesce((select jsonb_agg(to_jsonb(v) order by v.name) from vitals v), '[]'::jsonb),
    'api',     (select to_jsonb(a) from api a),
    'routes',  coalesce((select jsonb_agg(to_jsonb(r)) from routes r), '[]'::jsonb),
    'series',  coalesce((select jsonb_agg(to_jsonb(s) order by s.t) from series s), '[]'::jsonb),
    'errors',  coalesce((select jsonb_agg(to_jsonb(e)) from errs e), '[]'::jsonb),
    'traffic', (select to_jsonb(t) from traffic t),
    'usage', jsonb_build_object(
      'users',           (select count(*) from public.profiles),
      'teachers',        (select count(*) from public.profiles where role = 'teacher'),
      'students',        (select count(*) from public.profiles where role = 'student'),
      'classes',         (select count(*) from public.classes),
      'groups',          (select count(*) from public.class_groups),
      'projects',        (select count(*) from public.projects),
      'tasks',           (select count(*) from public.class_tasks),
      'submissions',     (select count(*) from public.task_submissions),
      'messages',        (select count(*) from public.messages) + (select count(*) from public.community_messages),
      'new_users',       (select count(*) from public.profiles where created_at >= v_from),
      'new_submissions', (select count(*) from public.task_submissions where submitted_at >= v_from)
    )
  ) into v_out;

  return v_out;
end;
$$;

-- ----------------------------------------------------------------------
--  RETENCION: la tabla crece con cada visita. Borrar lo viejo evita que el
--  plan gratuito de Supabase se llene. Llamar cada cierto tiempo:
--    select public.metrics_prune(30);
-- ----------------------------------------------------------------------
create or replace function public.metrics_prune(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.app_metrics where ts < now() - make_interval(days => greatest(1, p_days));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.is_teacher()            to authenticated, service_role;
grant execute on function public.metrics_overview(int)   to authenticated, service_role;
grant execute on function public.metrics_prune(int)      to service_role;
