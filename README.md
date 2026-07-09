# NexusForge OS

Plataforma académica gamificada para estudiantes de ingeniería de la UTH. Integra un aula tipo comunidad (chats por clase y grupo), gestión de clases por código, escuadrones de trabajo, tableros Kanban por grupo y un sistema de recompensas.

## Tecnologías

- **Next.js 14** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** con estilo neomórfico mate personalizado
- **Supabase** (autenticación, base de datos PostgreSQL, RLS y realtime)

## Requisitos

- Node.js 18 o superior
- Una instancia de Supabase (URL y claves)

## Configuración

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y completa tus credenciales de Supabase:

   ```bash
   cp .env.example .env.local
   ```

3. En Supabase, abre el **SQL Editor** y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql) para crear las tablas, políticas y realtime.

## Ejecutar en desarrollo

```bash
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Estructura

```
src/
  app/          Rutas (dashboard, aula, chat, autenticación)
  components/   Componentes de UI reutilizables
  lib/          Acceso a datos, sesión y helpers de Supabase
supabase/
  schema.sql    Esquema completo de la base de datos
```

## Roles

- **Catedrático** — crea y gestiona clases, grupos y proyectos.
- **Estudiante** — se une a clases por código, participa en su escuadrón y el chat.
- **Visitante** — acceso de solo lectura a la comunidad.
