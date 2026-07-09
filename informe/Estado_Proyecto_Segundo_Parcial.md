# NexusForge OS — Estado del Proyecto

**Asignatura:** Programación para Sistemas Abiertos II
**Etapa:** Segundo Parcial · Desarrollo
**Estudiante:** Ana Leticia Montes Sarmiento · Cuenta 202120030068

---

## De qué trata el proyecto

**NexusForge OS** es una plataforma web colaborativa y **gamificada** para gestionar proyectos de ingeniería de software en la UTH. Reúne en un solo lugar lo que hoy está disperso (Google Classroom + Trello + GitHub + Discord): gestión de clases, escuadrones de trabajo, tablero Kanban, chat en tiempo real y una capa de juego (monedas, XP, rangos, retos).

**Roles:** Catedrático · Estudiante · Visitante.

**Stack actual:** Next.js 14 (App Router) + TypeScript + Tailwind CSS · Supabase (autenticación, PostgreSQL, RLS y realtime).

---

## Lo que ya está construido — funcionalidades esenciales

| Funcionalidad esencial (informe 1er parcial) | Estado | Notas |
|---|---|---|
| Registro / inicio de sesión con los 3 roles | Hecho | Correo + Microsoft / Google / GitHub; clave institucional para docente |
| Gestión de clases y grupos por código | Hecho | Unión por código, escuadrones dentro de la clase |
| Tablero Kanban (TODO / DOING / DONE) | Hecho | Por grupo, sincronizado en vivo |
| Chat en vivo (grupo / clase / comunidad) | Hecho | Presencia "en línea", "escribiendo…", borrar, moderación docente |
| Base de datos PostgreSQL conectada | Hecho | Supabase, con RLS por rol |
| Perfil de proyecto con repositorio / demo / despliegue | Hecho | Cada grupo publica su entrega: título, descripción y enlaces de GitHub / despliegue / video |

---

## Gestión avanzada de grupos y proyectos (catedrático)

Construido después del corte inicial; es el núcleo de la operación del aula.

| Funcionalidad | Estado | Notas |
|---|---|---|
| Crear grupos: uno a uno o **varias salas de golpe** | Hecho | El input muestra el total y crea solo las que faltan; emblema por defecto |
| **Personalizar sala** (nombre, emblema, color) | Hecho | Lo hacen los integrantes o el catedrático (función segura del servidor) |
| Asignar / quitar estudiantes de grupos, marcar líder | Hecho | Desde la vista "Gestión" |
| **Selección múltiple** de salas | Hecho | Checkbox por tarjeta + barra de acciones en lote |
| **Archivar / desarchivar** salas | Hecho | Archivar las oculta del aula sin borrarlas; sección "Archivadas" |
| **Eliminar en lote** (con confirmación) | Hecho | — |
| **Buscador + paginado** de salas | Hecho | Filtra por nombre; 8 por página, sin scroll largo |
| **Asignación de proyecto a grupos** | Hecho | Modalidad por clase: **aleatorio**, **eligen de la lista** o **crean el suyo** |
| Configurar el proyecto de la clase (rúbrica, entregables, fecha, tamaño de equipo) | Hecho | Desde la página de la clase |

---

## Seguridad y privacidad (RLS)

| Regla | Estado | Notas |
|---|---|---|
| Autorización por rol y por pertenencia | Hecho | Políticas RLS en todas las tablas |
| **Chat / tablero / proyecto de grupo privados** | Hecho | Solo los integrantes del grupo (o el catedrático) los ven; los demás ven que el grupo existe con candado |
| Canal general de la clase | Hecho | Visible para toda la clase |
| Moderación del catedrático | Hecho | Puede borrar cualquier mensaje de su clase |

---

## Capa gamificada — opcional en el informe

| Elemento | Estado | Notas |
|---|---|---|
| Monedas + XP + retos que dan XP | Base hecha | Hero gamer, quests, ranking del aula |
| Rangos (Bronce a Diamante) | Parcial | Se muestra rango; falta lógica de ascenso automática |
| Votos / calificación con estrellas / duelos | Pendiente | — |
| Galería pública con bordes por rango | Pendiente | Ruta retirada |
| Ruleta / logros de Recompensas | Parcial | UI existe; falta conectar a monedas reales |

---

## Cumplimiento del Segundo Parcial (Desarrollo — 10 pts · entregable: Demo)

| Requisito del brief del curso | Estado | Notas |
|---|---|---|
| Estructura del proyecto + dependencias | Hecho | — |
| Frontend: UI, responsive, datos reales por API | Hecho | — |
| Backend: API, autenticación + autorización, BD, seguridad | Hecho | Supabase + RLS = autorización real; pendiente pulir logs/errores |
| Modelo de datos final + migraciones + índices | Hecho | `supabase/schema.sql` con índices y funciones de seguridad |
| Repositorio en GitHub / GitLab | Pendiente | Aún no es repositorio git |
| Pruebas unitarias / de usuario | Pendiente | Sin pruebas todavía |

---

## Punto importante para la exposición

En el informe del primer parcial se planteó el tiempo real con **Node.js + Socket.IO** (servidor independiente) y la base de datos con **Prisma ORM**. En el desarrollo se **cambió** a **Supabase Realtime** (postgres_changes + broadcast, con respaldo por refresco periódico) y sin Prisma.

Es una **decisión técnica defendible**: Supabase concentra autenticación, base de datos, realtime y RLS en un solo servicio, lo que reduce infraestructura y complejidad. Conviene **presentarlo como una mejora de arquitectura**, no omitirlo, ya que difiere de lo escrito en el informe.

---

## Prioridades para cerrar el Segundo Parcial

1. **Crear el repositorio en GitHub** — requisito explícito del parcial; hoy el proyecto no es repositorio git. Rápido y suma directo.
2. **Subir PDF del enunciado** y **logo propio de la sala** — requieren configurar Supabase Storage (almacenamiento de archivos).
3. **Preparar el guion de la demo** — flujo sugerido: el docente crea la clase y su proyecto → crea varias salas → elige la modalidad de asignación → el estudiante entra por código, se une a su sala, la personaliza, usa el Kanban, chatea y publica su entrega (GitHub / deploy / video).

### Opcional (si sobra tiempo)

- Modalidad **individual** (cada estudiante su "grupo de 1").
- Conectar Recompensas (monedas/XP reales) y lógica de rangos automáticos.
- Calificación con estrellas o votos de la comunidad.
- Ajustes de manejo de errores y logs en el backend.
