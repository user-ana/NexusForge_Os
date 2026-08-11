---
noteId: "e7c4d08095c411f194c22d32e32ad913"
tags: []

---

# Manual de aplicación — NexusForge OS

**Asignatura:** Programación para Sistemas Abiertos II · **Entregable:** Tercer Parcial
**Estudiante:** Ana Leticia Montes Sarmiento · Cuenta 202120030068
**Repositorio:** https://github.com/user-ana/NexusForge_Os

Documentación técnica del sistema: para quien tenga que **mantenerlo, desplegarlo o extenderlo**.
El manual de usuario, que explica cómo *usarlo*, es un documento aparte.

---

## 1. Qué es

Plataforma web para gestionar proyectos de ingeniería de software en el aula. Reúne en un solo
lugar lo que hoy vive disperso entre Google Classroom, Trello, un grupo de chat y GitHub: clases,
grupos de trabajo, tablero Kanban, tareas con entrega y calificación, chat en tiempo real, material
de estudio y un asistente de IA.

**Tres roles**, con permisos y vistas distintas:

| Rol | Qué puede hacer |
|---|---|
| **Catedrático** | Crear clases, grupos y proyectos; publicar y calificar tareas; ver el panel de monitoreo |
| **Estudiante** | Unirse por código, trabajar en su grupo, entregar tareas, consultar su avance |
| **Visitante** | Explorar la plataforma sin datos de aula |

---

## 2. Arquitectura

```
   NAVEGADOR                    SERVIDOR (Linux)                SERVICIOS
┌──────────────┐            ┌────────────────────┐        ┌──────────────────┐
│  Next.js 14  │            │  Rutas de API      │        │  Supabase        │
│  React 18    │  ────────▶ │  (/src/app/api)    │ ─────▶ │  PostgreSQL 15   │
│  Tailwind    │            │                    │        │  Auth · RLS      │
│              │            │  Node.js 22        │        │  Realtime        │
│  Supabase JS │ ─────────────────────────────────────▶   │  Storage         │
└──────────────┘   consulta directa (con RLS)             └──────────────────┘
        │                            │
        │                            ▼
        │                   ┌──────────────────┐
        └──── voz, PDF ───▶ │  Ollama          │
             (navegador)    │  Llama 3.2       │
                            └──────────────────┘
```

**Dos caminos hacia los datos, a propósito:**

1. **El navegador consulta PostgreSQL directamente** con la llave pública (anon), y **RLS decide
   qué puede ver**. Es lo que usa el 90 % de la aplicación: clases, grupos, tareas, chat.
2. **Las rutas de API** existen solo para lo que el navegador no debe poder hacer: hablar con la
   IA, validar la clave de docente, escribir métricas, borrar cuentas. Ahí es donde viven las
   llaves secretas.

Entender esta separación es lo más importante del sistema: **la seguridad no está en las rutas de
API, está en RLS.** Ver la sección 5.

---

## 3. Stack y decisiones técnicas

| Capa | Tecnología | Por qué |
|---|---|---|
| Interfaz | Next.js 14 (App Router), React 18, TypeScript | Renderizado híbrido y tipado estático de punta a punta |
| Estilos | Tailwind CSS + CSS propio (`globals.css`) | Utilidades para maquetar; CSS propio para el lenguaje visual neomórfico |
| Base de datos | PostgreSQL 15 (Supabase) | Relacional, con RLS nativo |
| Autenticación | Supabase Auth (correo + Microsoft, Google, GitHub) | Integrada con RLS: `auth.uid()` está disponible en cada política |
| Tiempo real | Supabase Realtime (`postgres_changes` + broadcast) | Ver decisión abajo |
| IA | Ollama + Llama 3.2, autohospedado | Costo marginal cero por consulta |
| Despliegue | Vercel (nube) y servidor Linux propio | Ver `DESPLIEGUE_LINUX.md` |

### Decisiones que conviene poder defender

**Supabase Realtime en vez de Node.js + Socket.IO.** El informe del Primer Parcial planteaba un
servidor de WebSockets independiente con Socket.IO y Prisma como ORM. En el desarrollo se cambió a
Supabase Realtime. El motivo es que un servidor de sockets aparte habría necesitado su propia
autenticación, su propio despliegue y su propia lógica de permisos, **duplicando las reglas de
acceso que ya viven en RLS** — y dos fuentes de verdad sobre quién puede ver qué es una fuente de
errores de seguridad. Realtime se suscribe a los cambios de PostgreSQL respetando las mismas
políticas. Se ganó coherencia y se perdió una pieza de infraestructura.

**IA autohospedada en vez de una API en la nube.** El asistente es el único componente cuyo costo
crecería con el uso. Con una API comercial, 10,000 consultas al mes cuestan entre 40 y 200 dólares
y **se duplican al duplicar los usuarios**; con el modelo corriendo en el servidor propio son unos
18 dólares fijos de electricidad, sin importar cuántos lo usen. El precio de esa decisión es
calidad de respuesta (un modelo de 3 mil millones de parámetros no compite con uno de frontera) y
trabajo de administración. Análisis completo en `MONETIZACION.md`.

**Consecuencia operativa de lo anterior:** el asistente **solo funciona donde está el modelo**. En
Vercel no responde, porque `localhost:11434` desde un centro de datos en Virginia no es la máquina
de nadie. Es la razón por la que la instalación en servidor Linux propio no es un ejercicio
académico: es donde el producto funciona completo.

---

## 4. Estructura del proyecto

```
src/
├── app/                    Rutas (Next.js App Router)
│   ├── api/                Endpoints del servidor — sección 6
│   ├── auth/               Registro, inicio de sesión, onboarding
│   ├── aula/[id]/          Aula de clase: grupos, Kanban, chat
│   └── dashboard/          Panel por rol, tareas, clases, monitoreo, asistente
├── backend/                Todo lo que habla con datos o con servicios
│   ├── services/           Un archivo por dominio (clases, tareas, chat…)
│   ├── external/           Integraciones externas (GitHub)
│   ├── realtime/           Presencia, "escribiendo…", bus de eventos
│   ├── apiGuard.ts         Identidad, rol y límite de intentos en las API
│   ├── metrics.ts          Registro de métricas del servidor
│   ├── ollama.ts           Configuración del servidor de IA
│   └── supabase.ts         Cliente del navegador
├── frontend/               Todo lo visual
│   ├── components/         Por área: layout, dashboard, assistant, tasks, ui
│   ├── hooks/              useT (idioma), useSpeech (voz)
│   ├── i18n/               Diccionarios español e inglés
│   └── session/            Sesión del navegador y puente con Supabase Auth
└── shared/                 Tipos y lógica que usan ambos lados

supabase/                   Scripts SQL — orden en la sección 8
docs/                       Esta documentación
scripts/                    Despliegue y pruebas de seguridad
```

La separación `frontend/` · `backend/` · `shared/` es deliberada: al abrir un archivo se sabe de
inmediato si corre en el navegador, en el servidor, o en ambos.

---

## 5. Seguridad

### 5.1 El principio

**La llave pública de Supabase (anon) viaja en el navegador. Por diseño.** Cualquiera puede
extraerla y llamar a la API de Supabase a mano, sin pasar por la interfaz. Por lo tanto:

> Esconder un botón no es seguridad. La única frontera que no se puede saltar desde el cliente es
> **Row Level Security**, que se evalúa dentro de PostgreSQL.

Toda función nueva debe responder a esta pregunta antes de darse por terminada: *¿qué política RLS
lo impide si lo llaman a mano?* Si la respuesta es "el botón no aparece", falta el candado.

### 5.2 Roles

El rol vive en `profiles.role` y **solo el servidor puede cambiarlo**: el disparador
`protect_profile_role` revierte en silencio cualquier intento que no venga del `service_role`.

Tres fuentes dicen cuál es el rol; solo una sirve para autorizar:

| Fuente | Uso |
|---|---|
| `localStorage` (`getSession()`) | Pintar la interfaz. **Nunca** autorizar |
| `user_metadata` del token | **No confiable**: el propio usuario puede escribirlo desde el navegador |
| `profiles.role` | La buena. Protegida por disparador |

En rutas de API se resuelve con `requireUserWithRole()` (`src/backend/apiGuard.ts`), que consulta
`profiles.role` con el token verificado.

### 5.3 Funciones de apoyo de RLS

| Función | Responde |
|---|---|
| `is_teacher()` | ¿Quien llama tiene el rol de catedrático? |
| `is_class_teacher(class_id)` | ¿Imparte esa clase? |
| `is_class_member(class_id)` | ¿Está inscrito o la imparte? |
| `is_group_member(group_id)` | ¿Pertenece a ese grupo? |
| `group_class_id(group_id)`, `channel_group_id(canal)`, `task_class_id(task_id)` | Resuelven la clase a la que pertenece algo |

Todas son `security definer` y `stable`: pueden leer las tablas que necesitan sin que las políticas
de esas tablas interfieran, y PostgreSQL las evalúa una sola vez por consulta.

### 5.4 Reglas de acceso, en resumen

| Recurso | Lectura | Escritura |
|---|---|---|
| Clases | Autenticados | **Solo catedráticos**, y solo la propia |
| Grupos, proyectos, tareas de clase | Miembros de la clase | Catedrático de esa clase |
| Chat de grupo (`g:<id>`) | Solo integrantes (o el catedrático) | Igual |
| Chat general de la clase | Toda la clase | Toda la clase |
| Entregas | El propio estudiante y el catedrático | El estudiante la suya; el catedrático la nota |
| Métricas | Solo catedráticos | Solo el servidor (`service_role`) |

> **Corrección de agosto de 2026.** La política de inserción de clases validaba
> `teacher_id = auth.uid()` sin comprobar el rol: impedía nombrar a otro como catedrático, pero no
> exigía serlo. Cualquier usuario autenticado podía crear una clase y volverse su docente, y desde
> ahí publicar tareas a estudiantes reales. Corregido en `supabase/role_guard.sql`, que ahora exige
> `is_teacher()`. Se auditó la base: ninguna clase había sido creada por un no-catedrático.

### 5.5 Defensas de las rutas de API

`src/backend/apiGuard.ts` provee:

- `requireUser(req)` — verifica el token de sesión. Sin token válido, el endpoint no hace nada.
- `requireUserWithRole(req)` — además resuelve el rol desde `profiles`.
- `rateLimit(clave, límite, ventana)` — corta el abuso automatizado. **Limitación conocida:** el
  contador vive en memoria del proceso, así que en un entorno sin servidor cada instancia tiene el
  suyo. Frena scripts, no un ataque distribuido. Para producción a escala haría falta Redis.
- `clientIp(req)` — lee `X-Forwarded-For`. Por eso el proxy inverso debe enviar esa cabecera
  (ver `DESPLIEGUE_LINUX.md`).

La clave institucional de docente **nunca llega al navegador**: se compara su SHA-256 en el
servidor, en tiempo constante, con límite de cinco intentos cada quince minutos.

---

## 6. API

Todas responden JSON. Las marcadas con sesión exigen `Authorization: Bearer <token>`.

| Ruta | Método | Sesión | Qué hace |
|---|---|---|---|
| `/api/health` | GET | No | Estado del servicio: sistema operativo, memoria, latencia de base de datos e IA. **200** si la base responde, **503** si no |
| `/api/metrics` | POST | Opcional | Recibe Core Web Vitals del navegador. Valida contra lista blanca |
| `/api/metrics` | GET | Sí (docente) | Resumen agregado para el panel de monitoreo |
| `/api/nexus` | POST | Sí | Conversación con el asistente. Ficha de datos según el rol verificado |
| `/api/assistant` | POST | Sí | Acciones del catedrático por voz o texto (crear clase, publicar tarea) |
| `/api/study` | POST | Sí | Tutor sobre el material de un módulo |
| `/api/pdf-summary` | POST | Sí | Resumen de un PDF |
| `/api/ai-write` | POST | Sí | Redacción asistida de enunciados |
| `/api/grade` | POST | Sí | Precalificación de una entrega |
| `/api/translate` | POST | Sí | Traducción en vivo |
| `/api/verify-teacher-key` | POST | Sí | Valida la clave institucional y otorga el rol de docente |
| `/api/delete-account` | POST | Sí | Borra la cuenta y sus datos |

Todas están instrumentadas con `withMetrics()`, que cronometra la respuesta y guarda duración y
código de estado para el panel de monitoreo.

---

## 7. Modelo de datos

18 tablas en PostgreSQL, todas con RLS activo. Agrupadas por dominio:

### Identidad y aula

| Tabla | Contenido | Relaciones |
|---|---|---|
| `profiles` | Espejo de `auth.users` con rol, nombre, carrera, número de cuenta, avatar | 1:1 con `auth.users` |
| `classes` | Clase que imparte un catedrático. Código único de acceso | `teacher_id` → `auth.users` |
| `enrollments` | Inscripción de un estudiante a una clase | Clave compuesta (clase, estudiante) |
| `class_groups` | Escuadrón de trabajo dentro de una clase. Nombre, emblema, color, líder | `class_id` → `classes` |
| `group_members` | Integrantes de cada grupo | Clave compuesta (grupo, estudiante) |

### Trabajo académico

| Tabla | Contenido |
|---|---|
| `projects` | Enunciado del proyecto: objetivos, entregables, rúbrica (jsonb), fecha, tamaño de equipo, modalidad de formación de grupos |
| `group_projects` | Entrega del grupo: título, repositorio, despliegue, video |
| `group_evaluations` | Nota y retroalimentación del proyecto |
| `kanban_tasks` | Tarjetas del tablero por grupo (`col`: todo / doing / done) |
| `class_tasks` | Tarea para toda la clase: parcial, fecha límite, puntos, entregables (jsonb), PDF, reglas de entrega |
| `task_submissions` | Entrega del estudiante: nota, retroalimentación, evidencia (jsonb), estado |

### Material de estudio y tutor

| Tabla | Contenido |
|---|---|
| `class_modules` | Módulo semanal de la clase, con parcial y estado de publicación |
| `module_files` | Archivos del módulo (PDF, diapositivas, enlaces) con su texto extraído |
| `tutor_sessions` | Conversación con el tutor de IA sobre un módulo |
| `tutor_messages` | Mensajes de esa conversación |
| `study_notes` | Apuntes del estudiante sobre un módulo |

### Comunicación y sistema

| Tabla | Contenido |
|---|---|
| `messages` | Chat del aula. Canal `general` o `g:<id>` para un grupo |
| `community_messages` | Chat global por categoría |
| `notifications` | Avisos al estudiante (tarea nueva, calificación) |
| `student_stats` | Monedas, XP y racha. **En desuso**: la gamificación se retiró del modo estudiante. La tabla se conserva por si se retoma |
| `app_metrics` | Métricas de rendimiento y uso. Ver `MONITOREO.md` |

### Índices

Definidos sobre las columnas por las que realmente se filtra: `(class_id, created_at desc)` en
tareas y mensajes, `(user_id, read, created_at desc)` en notificaciones, y cuatro sobre
`app_metrics` por rango de tiempo. La clave de un índice útil es que coincida con el `where` y el
`order by` de las consultas que se hacen de verdad.

---

## 8. Instalación

### Requisitos

Node.js 22 LTS · una cuenta de Supabase · Ollama con Llama 3.2 (opcional, solo para el asistente).

### Pasos

```bash
git clone https://github.com/user-ana/NexusForge_Os.git
cd NexusForge_Os
npm ci
cp .env.example .env.local     # y completar con las llaves reales
npm run dev                    # http://localhost:3000
```

### Scripts SQL — el orden importa

En el editor SQL de Supabase, en esta secuencia:

1. `schema.sql` — tablas base, funciones y políticas RLS
2. `security_patch.sql` — disparadores de perfil y protección del rol
3. `tasks_notifications.sql` — tareas de clase, entregas y notificaciones
4. `class_modules.sql` — módulos y archivos
5. `study_notes.sql` · `tutor_sessions.sql` — apuntes y tutor
6. `grade_submission.sql` · `submit_rules.sql` · `group_rename_rules.sql` · `community_por_catedratico.sql`
7. `metrics.sql` — monitoreo
8. **`role_guard.sql`** — candado de rol (sección 5.4)

Son idempotentes: se pueden volver a ejecutar sin romper nada.

### Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ambos | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ambos | Llave pública. RLS la limita |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | Se salta RLS. Rol docente y métricas |
| `TEACHER_KEY_HASH` | Solo servidor | SHA-256 de la clave institucional |
| `OLLAMA_BASE_URL` | Solo servidor | Servidor de IA |
| `OLLAMA_MODEL` | Solo servidor | `llama3.2` |
| `OLLAMA_VISION_MODEL` | Solo servidor | Modelo con visión. Vacío = lectura de imágenes apagada |
| `METRICS_ENABLED` | Solo servidor | `false` apaga el registro de métricas |

> Las variables `NEXT_PUBLIC_` **se incrustan en el código del navegador durante la construcción**.
> Tienen que existir antes de `npm run build`, y nunca deben contener un secreto.

---

## 9. Despliegue

Dos entornos, documentados en detalle en **[DESPLIEGUE_LINUX.md](DESPLIEGUE_LINUX.md)**:

- **Vercel** — publicado en Internet con dominio y certificado válido. `git push` despliega.
- **Servidor Linux propio** (probado en Rocky Linux 10) — `scripts/deploy-rocky.sh` deja la
  aplicación como servicio de systemd detrás de nginx, con TLS, cortafuegos y SELinux configurados.
  Es idempotente: sirve para instalar y para actualizar.

---

## 10. Mantenimiento

### Monitoreo

Panel en `/dashboard/metrics` (solo catedráticos). Mide Core Web Vitals reales, latencia y errores
de cada ruta de API, estado del servicio y uso de la plataforma. Detalle en
**[MONITOREO.md](MONITOREO.md)**.

Para una sonda externa basta con `GET /api/health`: devuelve 200 o 503 sin necesidad de sesión.

### Retención de métricas

La tabla crece con cada visita. Para que el plan gratuito de Supabase no se llene:

```sql
select public.metrics_prune(30);   -- borra lo anterior a 30 días
```

### Pruebas de seguridad

```bash
npm run security:test    # políticas RLS
npm run security:api     # defensas de los endpoints
```

---

## 11. Resolución de problemas

| Síntoma | Causa probable | Comprobación |
|---|---|---|
| El asistente dice que no puede conectar | Ollama no alcanzable desde el servidor | `curl .../api/health` → campo `ai` |
| El panel de Monitoreo sale vacío | Falta ejecutar `metrics.sql` | Buscar la tabla `app_metrics` en Supabase |
| El dominio de Supabase no resuelve (NXDOMAIN) | El proyecto gratuito se pausó por inactividad | Restaurarlo desde el panel de Supabase |
| La aplicación construye pero no ve la base | Faltaban las `NEXT_PUBLIC_` al construir | Reconstruir con el `.env.local` en su sitio |
| 502 en el servidor propio | SELinux bloquea el proxy inverso | `sudo setsebool -P httpd_can_network_connect 1` |
| Un estudiante ve funciones de docente | Rol mal asignado en `profiles` | Consultar `profiles.role`; el candado está en `role_guard.sql` |

---

## 12. Limitaciones conocidas

Se documentan porque un manual técnico honesto vale más que uno halagador.

- **El asistente de IA solo funciona donde corre el modelo.** En Vercel no responde (sección 3).
- **El límite de intentos vive en memoria del proceso**: en un entorno sin servidor no es global.
- **Sin pruebas automatizadas.** Existen los dos scripts de seguridad, pero no hay pruebas
  unitarias ni de integración. Es la deuda técnica más grande del proyecto.
- **La lectura de imágenes está apagada** por defecto: los modelos de visión que caben en 6 GB de
  memoria de video no dan resultados fiables.
- **Sin alertas.** El monitoreo mide y muestra, pero no avisa a nadie cuando algo se cae.
- **El plan gratuito de Supabase pausa el proyecto** tras siete días sin actividad.

---

## 13. Documentos relacionados

| Documento | Contenido |
|---|---|
| [DESPLIEGUE_LINUX.md](DESPLIEGUE_LINUX.md) | Instalación paso a paso en Rocky Linux 10, nginx, TLS, SELinux |
| [MONITOREO.md](MONITOREO.md) | Qué se mide, cómo, y cómo leer el panel |
| [MONETIZACION.md](MONETIZACION.md) | Costos reales, comparación de mercado y estrategia de ingresos |
| `/dashboard/manual` | Manual de usuario dentro de la aplicación |
