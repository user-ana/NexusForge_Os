---
noteId: "ccdce630952a11f194c22d32e32ad913"
tags: []

---

# Monitoreo de métricas y rendimiento

**Asignatura:** Programación para Sistemas Abiertos II · **Etapa:** Tercer Parcial · Mantenimiento y evolución

> Requisito del marco de trabajo: *"2. Mantenimiento y evolución — … **Monitoreo de métricas y rendimiento**."*

---

## 1. Qué se mide y por qué

Un sistema en producción tiene que poder responder cuatro preguntas. El panel está organizado
exactamente así:

| Pregunta | Qué la responde | De dónde sale el dato |
|---|---|---|
| ¿Está vivo? | Estado del servicio: sistema operativo, memoria, latencia de la base de datos y del servidor de IA | `GET /api/health` (módulo `os` de Node + ping real a cada dependencia) |
| ¿Va rápido **para el usuario**? | Core Web Vitals: LCP, INP, CLS, FCP, TTFB | Medidos por el **navegador de cada visitante** con la API de rendimiento del estándar web |
| ¿Va rápido **el servidor**? | Latencia p50/p95, tasa de error y rutas más lentas | Cada ruta de API se cronometra a sí misma (`withMetrics`) |
| ¿Lo usa alguien? | Vistas de página, usuarios activos, clases, grupos, tareas, entregas | Eventos `pageview` + conteos reales de la base de datos |

**Ningún número es inventado ni de ejemplo.** Todo sale de la tabla `app_metrics`, que se llena
sola con cada visita y cada llamada a la API.

### Por qué percentil 75 y no promedio

Los Core Web Vitals se reportan en **p75**: el 75 % de los usuarios tuvo esa experiencia o mejor.
El promedio esconde justamente a quien hay que vigilar — el estudiante con conexión lenta desde el
celular. Es también el criterio oficial de Google, y por eso los umbrales del semáforo son los suyos:

| Métrica | Qué mide | Bueno | Mejorable | Deficiente |
|---|---|---|---|---|
| **LCP** — Largest Contentful Paint | Cuándo se ve el contenido principal | ≤ 2.5 s | ≤ 4 s | > 4 s |
| **INP** — Interaction to Next Paint | Qué tan rápido responde a un clic | ≤ 200 ms | ≤ 500 ms | > 500 ms |
| **CLS** — Cumulative Layout Shift | Cuánto "salta" la página al cargar | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| **FCP** — First Contentful Paint | Primer pixel con contenido | ≤ 1.8 s | ≤ 3 s | > 3 s |
| **TTFB** — Time To First Byte | Respuesta del servidor | ≤ 0.8 s | ≤ 1.8 s | > 1.8 s |

---

## 2. Arquitectura

```
NAVEGADOR                          SERVIDOR (Linux)                 POSTGRESQL
─────────                          ────────────────                 ──────────
WebVitalsReporter                  POST /api/metrics
  mide LCP/INP/CLS/…      ──────>    valida y filtra      ──────>   app_metrics
  y cada pageview                    (llave del servidor)              │
                                                                       │
Cada ruta de API                   withMetrics()                       │
  /api/nexus, /api/study   ──────>   cronometra y guarda   ──────>     │
                                                                       │
Panel del catedrático              GET /api/metrics                    │
  /dashboard/metrics       ──────>   comprueba rol docente ──────>  metrics_overview()
                                     y agrega en la base           percentiles y series
```

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/metrics.sql` | Tabla `app_metrics`, políticas RLS, función `metrics_overview()` y retención |
| `src/backend/metrics.ts` | Escritura con la llave del servidor + `withMetrics()` para instrumentar rutas |
| `src/app/api/metrics/route.ts` | `POST` ingesta validada · `GET` resumen (solo catedráticos) |
| `src/app/api/health/route.ts` | Estado del servicio (público, para sondas externas) |
| `src/frontend/components/layout/WebVitalsReporter.tsx` | Mide en el navegador y envía por lotes |
| `src/backend/services/metrics.ts` | Consulta desde el cliente + umbrales y formato |
| `src/app/dashboard/metrics/page.tsx` | El panel |

---

## 3. Decisiones de diseño

**El navegador nunca escribe en la tabla.** `app_metrics` no tiene política de `INSERT` para
usuarios: todo entra por `POST /api/metrics`, que valida el nombre de la métrica contra una lista
blanca, recorta el valor a un máximo razonable y descarta lo que no reconoce. Sin esto, cualquiera
podría inflar el panel desde la consola del navegador.

**Las rutas se instrumentan una a una, no con un middleware.** El middleware de Next.js corre
*antes* del handler, así que no puede cronometrar cuánto tarda en responder. `withMetrics()` sí
envuelve el handler completo:

```ts
export const POST = withMetrics('/api/nexus', handler)

async function handler(req: Request) { … }
```

**Las rutas con identificador se normalizan.** `/dashboard/classes/9f3c…/projects/1a2b…` se guarda
como `/dashboard/classes/[id]/projects/[id]`. Sin esto cada clase sería una "ruta" distinta y la
tabla de rutas lentas no serviría para nada.

**Los percentiles los calcula PostgreSQL, no el navegador.** `metrics_overview()` devuelve el panel
completo en un solo `jsonb`: una sola ida a la base en vez de traer miles de filas al cliente.

**El monitoreo nunca puede tumbar la aplicación.** Todo error al registrar se traga en silencio.
Si falta `SUPABASE_SERVICE_ROLE_KEY` o se pone `METRICS_ENABLED=false`, el registro simplemente
no ocurre y la aplicación sigue igual.

**CLS viaja multiplicado por 1000.** Es un score sin unidad y muy pequeño (0.08); guardarlo tal cual
lo perdería al redondear. El panel lo divide de vuelta al mostrarlo.

---

## 4. Puesta en marcha

1. Abrir el editor SQL de Supabase y ejecutar **`supabase/metrics.sql`** (después de `schema.sql`).
2. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` está configurada en el entorno del servidor
   (local en `.env.local`, producción en el panel de Vercel).
3. Entrar como catedrático a **Monitoreo** en el menú lateral.

Comprobación rápida sin abrir la app:

```bash
curl -s http://localhost:3000/api/health | head -c 400
```

Mientras el paso 1 no se ejecute, el panel muestra el aviso de configuración y las métricas se
descartan en silencio: la aplicación funciona igual.

---

## 5. Retención

La tabla crece con cada visita. Para que el plan gratuito de Supabase no se llene:

```sql
select public.metrics_prune(30);   -- borra lo anterior a 30 días
```

Se puede automatizar con `pg_cron` en Supabase:

```sql
select cron.schedule('metrics-prune', '0 4 * * *', $$select public.metrics_prune(30)$$);
```

---

## 6. Qué mostrar en la presentación final

1. **Panel Monitoreo** con datos reales tras navegar un par de minutos por la aplicación.
2. **Tarjeta *Sistema*** — dice `linux`: prueba de que la solución corre sobre servidor Linux.
3. **Core Web Vitals en verde** — rendimiento medido, no afirmado.
4. **Tabla de rutas más lentas** — las rutas de IA (`/api/nexus`, `/api/study`) salen arriba, y eso
   es esperado: hablan con un modelo de lenguaje. Es el ejemplo perfecto de "aquí es donde
   optimizaríamos primero", que es la conversación que el monitoreo permite tener.
5. **`curl` a `/api/health` en vivo** desde la terminal, para mostrar que hay una interfaz de
   máquina y no solo una pantalla bonita.

---

## 7. Pendiente (evolución)

- Alertas: enviar un aviso cuando la tasa de error pase de un umbral o la base deje de responder.
- Presupuesto de rendimiento en el pipeline: fallar el despliegue si el LCP empeora.
- Distinguir errores de cliente (4xx, culpa del usuario) de errores de servidor (5xx) en la tasa.
