-- ======================================================================
--  REGLAS DE ENTREGA — el catedrático define qué debe cumplir la entrega
--
--  Se guardan en la propia tarea como JSON. El estudiante ve un checklist y no
--  puede entregar hasta cumplir las reglas marcadas. Ejemplos:
--    { "onlyPdf": true, "minPages": 4, "requireAccount": true, "requireName": true }
--
--  Idempotente.
-- ======================================================================
alter table public.class_tasks add column if not exists submit_rules jsonb default '{}'::jsonb;

-- Fin del parche de reglas de entrega
