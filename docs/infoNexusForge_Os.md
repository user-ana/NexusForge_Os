---
noteId: "98d8dfe07ae711f19fe005a6608c8a68"
tags: []

---

# Especificaciones Técnicas y Funcionales — NexusForge OS

Este documento sirve como la fuente única de verdad para el desarrollo bajo **Spec-Driven Design (SDD)** de **NexusForge OS**, una plataforma web colaborativa, gamificada y en tiempo real diseñada para la gestión de proyectos de ingeniería de software académicos.

---

## 1. Visión General del Producto

### 1.1. Contexto y Audiencia Target
NexusForge OS es un entorno operativo web adaptado para la comunidad de ingeniería de la Universidad. Consolida la gestión de entregables, el seguimiento de tareas académicas a largo plazo y la interacción competitiva en un único ecosistema unificado.

### 1.2. El Problema que Resuelve
* **Dispersión de Entregables:** Elimina la necesidad de utilizar herramientas fragmentadas para el código, la documentación y los videos demostrativos, centralizándolo todo en una sola vista de proyecto.
* **Falta de Comunicación Contextual:** Sustituye los canales de comunicación externos no estructurados por hilos de discusión y chat en vivo integrados de manera nativa.
* **Opacidad en el Avance Grupal:** Resuelve la falta de visibilidad en la asignación y progreso de tareas mediante un tablero Kanban estricto.

### 1.3. Factor Diferenciador: Gamificación Competitiva
A diferencia de los gestores tradicionales, la plataforma transforma la presentación de proyectos en una competencia activa inspirada en mecánicas de redes y foros modernos:
* **Duelos de Proyectos:** Los equipos exponen sus desarrollos públicamente para someterse a la retroalimentación y escrutinio de la comunidad estudiantil.
* **Economía de Votos (Monedas):** Cada voto positivo válido de un usuario registrado actúa como una "moneda" que se inyecta directamente al proyecto.
* **Rangos de Clasificación Automática:** Los proyectos migran dinámicamente entre cinco categorías jerárquicas computadas a partir del volumen de interacción (votos, estrellas, comentarios):
    `Bronce` ➔ `Plata` ➔ `Oro` ➔ `Platino` ➔ `Diamante`

---

## 2. Identidad Visual y Experiencia de Usuario (UX/UI)

Inspirado directamente por la interfaz de plataformas de alta densidad de información como **Discord** y **Twitch**, el diseño de interfaz de NexusForge OS sigue directrices estrictas para priorizar la inmersión técnica y mitigar la fatiga visual.

* **Paleta de Colores Base:** Esquema *Ultra-Dark* dominante empleando paletas de grises oscuros y azul marino profundo (`#0B0E14` a `#151A22`) para fondos de contenedores y paneles primarios. El texto base utiliza tonos gris claro suaves (`#E2E8F0`).
* **Colores de Acento:** Uso estratégico de violeta eléctrico y azul neón de alta saturación para representar estados activos, llamadas a la acción, notificaciones en tiempo real e indicadores de flujo en vivo.
* **Arquitectura de Layout (Multi-Panel):** * *Panel Izquierdo:* Navegación estática de clases y canales.
    * *Panel Central:* Espacio de trabajo reactivo (Tableros, perfil del proyecto o feed de comentarios).
    * *Panel Derecho:* Control de presencia en tiempo real (Miembros activos, estado del chat de grupo).
* **Indicadores Gamificados:** Tarjetas de proyecto con bordes iluminados reactivos al rango alcanzado (por ejemplo: resplandor dorado para nivel Oro; cian cibernético para nivel Diamante).

---

## 3. Matriz de Roles y Permisos (RBAC)

El sistema opera bajo un control de acceso basado en roles estricto para proteger la integridad de las evaluaciones académicas.

| Permiso / Acción | Maestro | Estudiante | Visitante |
| :--- | :---: | :---: | :---: |
| Crear "Clases" y generar códigos de acceso | **Sí** | No | No |
| Crear "Grupos" e invitar/asignar miembros | **Sí** | **Sí** | No |
| Vincular Repositorios de GitHub y URL de despliegue | No | **Sí** (Propio Grupo) | No |
| Operaciones CRUD en el Tablero Kanban del Grupo | No | **Sí** (Propio Grupo) | No |
| Enviar Mensajes en el Chat en Vivo del Grupo | No | **Sí** (Propio Grupo) | No |
| Ver Proyectos Públicos y Calificar con Estrellas | **Sí** | **Sí** | **Sí** |
| Acumular Monedas en Duelos | No | **Sí** (Voto recibido) | No |

---

## 4. Arquitectura de Datos y Modelado de Entidades

Diseño lógico de las tablas relacionales optimizadas para PostgreSQL utilizando sintaxis conceptual compatible con Prisma ORM.

### 4.1. Clase
Representa la unidad organizativa permanente del aula virtual. A diferencia de un ciclo académico tradicional, su contenido persiste indefinidamente en el tiempo para auditoría de proyectos terminados.
* `id`: `UUID` (Primary Key)
* `name`: `String` (Nombre de la asignatura/sección)
* `accessCode`: `String` (Único — Código alfanumérico de ingreso autónomo)
* `teacherId`: `UUID` (Foreign Key -> Usuario)
* `createdAt`: `DateTime` (Fecha de creación)

### 4.2. Grupo
Unidad de trabajo conformada por estudiantes dentro de una clase específica. Puede configurarse como público o privado.
* `id`: `UUID` (Primary Key)
* `name`: `String` (Nombre del equipo de desarrollo)
* `isPublic`: `Boolean` (Visibilidad externa en la galería de duelos)
* `classId`: `UUID` (Foreign Key -> Clase)

### 4.3. Proyecto
El núcleo del trabajo estudiantil. Contiene los metadatos de integración técnica y los agregados numéricos de la gamificación.
* `id`: `UUID` (Primary Key)
* `title`: `String` (Nombre del producto de software)
* `iconUrl`: `String` (Ruta al asset almacenado en Supabase Storage)
* `videoUrl`: `String` (Enlace externo a demostración de video)
* `githubRepoUrl`: `String` (URL del repositorio Git conectado vía OAuth)
* `deployUrl`: `String` (Enlace de producción del entorno de desarrollo)
* `coins`: `Int` (Contador por defecto en 0; incrementado por votos válidos)
* `ratingAvg`: `Float` (Promedio flotante de calificaciones entre 1.0 y 5.0)
* `groupId`: `UUID` (Foreign Key -> Grupo, Relación de unicidad 1:1)

### 4.4. Tarea
Entidad de control atómica mapeada al tablero Kanban del grupo.
* `id`: `UUID` (Primary Key)
* `title`: `String` (Título de la asignación)
* `description`: `Text` (Detalle técnico de la entrega)
* `dueDate`: `DateTime` (Fecha límite de entrega)
* `status`: `Enum` (`TODO`, `DOING`, `DONE`)
* `assignedToId`: `UUID` (Foreign Key -> Usuario, Nullable)
* `groupId`: `UUID` (Foreign Key -> Grupo)

### 4.5. Comentarios
Hilos cronológicos inversos de discusión pública adjuntos al perfil del proyecto.
* `id`: `UUID` (Primary Key)
* `content`: `Text` (Cuerpo del comentario)
* `createdAt`: `DateTime` (Timestamp con precisión de milisegundos)
* `userId`: `UUID` (Foreign Key -> Usuario)
* `projectId`: `UUID` (Foreign Key -> Proyecto)

---

## 5. Stack Tecnológico e Infraestructura

El sistema utiliza un ecosistema homogéneo basado en TypeScript para unificar los contratos de datos entre cliente y servidor:

* **Frontend Principal:** `Next.js 14+ (App Router)` y `Tailwind CSS` para interfaces densas y estructuradas a nivel de componentes reactivos.
* **Persistencia:** Base de datos relacional `PostgreSQL` gestionada mediante el ORM `Prisma`.
* **Infraestructura Back-End Integrada:** `Supabase` para el aprovisionamiento inmediato de autenticación robusta, PostgreSQL administrado y buckets de almacenamiento de objetos (*Storage*).
* **Capa de Tiempo Real:** `Node.js` nativo complementado con `Socket.IO` independiente para la comunicación síncrona bidireccional.

---

## 6. Análisis de Riesgos y Debilidades de Arquitectura

Durante la fase de diseño técnico guiado por especificaciones, se detectan dos debilidades conceptuales e infraestructurales críticas que requieren implementación obligatoria de ingeniería para evitar fallos de producción:

### 6.1. Contradicción de Entorno: Next.js Serverless vs. Socket.IO (Estado Persistente)
* **Debilidad:** El stack incluye Next.js y Socket.IO de manera conjunta. La infraestructura serverless tradicional donde comúnmente se aloja Next.js (como los entornos distribuidos por funciones de Vercel) **no soporta conexiones WebSocket persistentes de larga duración**. Las funciones serverless mueren tras unos segundos, rompiendo los estados de los chats en vivo, las alertas Kanban y los marcadores de duelos.
* **Mitigación Obligatoria:** Se prohibe alojar el socket en las API Routes de Next.js. El backend de tiempo real debe desacoplarse estrictamente. Next.js procesará exclusivamente el renderizado web, llamadas REST y *Server Actions*. Paralelamente, se debe desplegar un servidor independiente de Node.js montado de forma persistente en un contenedor dedicado (ej. Railway, Render, VPS o AWS EC2) que aloje el proceso de `Socket.IO` y mantenga una comunicación directa al bus de datos de PostgreSQL.

### 6.2. Vulnerabilidad de Fraude en la Votación Anónima de Visitantes
* **Debilidad:** La especificación funcional permite a los usuarios de perfil "Visitante" (no autenticados) emitir votos de estrellas para influir en la posición del proyecto. Al no requerir inicio de sesión, el sistema queda completamente expuesto a ataques de denegación de servicio lógicos o scripts automatizados de inyección masiva de registros (votos falsos alternando proxies o headers de usuario). Esto destruiría por completo la validez de la economía gamificada de rangos (Bronce a Diamante).
* **Mitigación Obligatoria:** Se altera la regla de negocio original. Las interacciones provenientes de un Visitante anónimo quedarán guardadas únicamente de forma local en la sesión (local storage) y solo servirán como una métrica informativa secundaria de popularidad. **Las "Monedas" reales y los ascensos automatizados de categoría del proyecto requerirán estrictamente el voto de un Estudiante o Maestro autenticado bajo el dominio institucional de la universidad.**
