<div align="center">

# NexusForge OS

**Plataforma web académica para gestionar el ciclo completo de proyectos de ingeniería de software:
clases, grupos, tableros, chat en vivo, evaluación por rúbrica y un asistente de IA propio y privado.**

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![IA](https://img.shields.io/badge/IA-Ollama_%2B_Llama_3-7C6CF0)](https://ollama.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)

[Ver demo en vivo](https://nexusforgeos.vercel.app)

</div>

---

## Qué es

NexusForge OS reúne, en un solo lugar y con un diseño profesional, todo el ciclo de un proyecto
académico de ingeniería de software: desde que el catedrático crea la clase y sube el enunciado,
hasta que el grupo organiza sus tareas, se comunica y entrega, y el catedrático evalúa por rúbrica.

Encima de eso incluye un **asistente con inteligencia artificial propio y privado** que consulta los
datos y ejecuta acciones por lenguaje natural, corriendo **localmente** (sin enviar datos a la nube).

## Características

| | |
|---|---|
| **Clases por código** | El catedrático crea clases y comparte un código; los estudiantes se inscriben con él. |
| **Proyectos por parcial** | Enunciado en PDF, enlace o texto, con requisitos, rúbrica y parcial (1, 2, 3 o final). |
| **Formación de grupos** | Dos modalidades: asignación manual o auto-inscripción con cupo y bloqueo. |
| **Tableros Kanban** | Cada grupo organiza su trabajo en columnas Por hacer / En progreso / Hecho. |
| **Chat en vivo** | Mensajería en tiempo real por grupo, clase y comunidad (Supabase Realtime). |
| **Supervisión y evaluación** | El catedrático ve el tablero y la entrega de cada grupo en solo lectura, y califica por rúbrica. |
| **Asistente de IA** | Consulta y ejecuta acciones por lenguaje natural, con confirmación previa. |
| **Manuales integrados** | Manual de Usuario y de Programador dentro de la propia plataforma. |

## El asistente de IA

Uno de los módulos más destacados. Es un modelo de lenguaje corriendo en la propia máquina, no en la nube:

- **Motor local y privado** — Ollama + Llama 3.2. Los datos de la clase no salen de la máquina.
- **RAG** — antes de responder, la app recupera los datos reales de la clase y se los da como contexto,
  para que responda con hechos y no invente.
- **Agéntico (tool-calling)** — puede crear clases, grupos y proyectos, o eliminar clases; no solo habla,
  actúa. Cada acción se ejecuta **con confirmación** y con los permisos del usuario (respetando RLS).
- **Robusto pese a un modelo pequeño** — validaciones deterministas (dato pendiente, corrección por verbo,
  aviso de duplicado, confirmación siempre) que lo hacen confiable.

## Stack tecnológico

- **Next.js 14** (App Router) + **React 18** + **TypeScript 5** estricto — frontend y backend en un solo proyecto.
- **Tailwind CSS 3** — tema neomórfico oscuro mate personalizado.
- **Supabase** — PostgreSQL, autenticación (PKCE), Realtime, Storage y seguridad a nivel de fila (RLS).
- **Ollama + Llama 3** — el asistente de IA, local y privado.
- **Vercel** — despliegue continuo desde GitHub.

## Arquitectura

El código separa responsabilidades para que sea ordenado y fácil de mantener:

```
src/
  app/          Rutas de Next.js: páginas + endpoints de API (incluye /api/assistant)
  frontend/     La vista: components, hooks, i18n, session
  backend/      Los datos y servicios: supabase, services, realtime, external
  shared/       Transversal: tipos y reglas compartidas
supabase/
  schema.sql    Esquema completo de la base de datos + seguridad (RLS)
```

## Puesta en marcha

**Requisitos:** Node.js 18 o superior y un proyecto de Supabase.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local   # y completa tus credenciales de Supabase

# 3. Levantar el servidor de desarrollo
npm run dev                  # http://localhost:3000
```

En Supabase, abre el **SQL Editor** y ejecuta [`supabase/schema.sql`](supabase/schema.sql) para crear
las tablas, políticas de seguridad y realtime.

**Variables de entorno principales** (`.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
OLLAMA_BASE_URL=http://localhost:11434   # servidor de Ollama (asistente de IA)
OLLAMA_MODEL=llama3.2                     # modelo a usar
```

**Asistente de IA (opcional, para desarrollo local):**

```bash
ollama pull llama3.2     # descargar el modelo
ollama run llama3.2      # probar por consola
```

## Roles

- **Catedrático** — crea y gestiona clases, proyectos y grupos; supervisa y evalúa por rúbrica. Usa el asistente de IA.
- **Estudiante** — se une a clases por código, elige su grupo, organiza tareas en Kanban y publica su entregable.
- **Visitante** — acceso de solo lectura para explorar la plataforma.

## Documentación

La explicación completa del proyecto (funcionalidad, arquitectura, lenguajes, la IA a fondo y las
decisiones de diseño) está en [`docs/INFORME_NEXUSFORGE_OS.txt`](docs/INFORME_NEXUSFORGE_OS.txt).

<div align="center">

Desarrollado por Ana Montes · Sistemas Abiertos 2

</div>
