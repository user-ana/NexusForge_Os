---
noteId: "nexusforge-documentacion-completa"
tags: [proyecto, documentacion, sistemas-abiertos-2]
---

# NexusForge OS — Mi Proyecto

> La Forja de Proyectos de Ingeniería — el sistema operativo donde nuestros proyectos de clase se desarrollan, suben de rango y llegan a empresas reales.

| | |
|---|---|
| **Asignatura** | Programación para Sistemas Abiertos II |
| **Institución** | Universidad Tecnológica de Honduras (UTH) |
| **Equipo** | Equipo 03 |
| **Tipo** | Aplicación web full-stack sobre servidor Linux |
| **Estado** | Parcial 1 — Planificación y Diseño |

---

## 1. De qué trata mi proyecto (el pitch)

Mi proyecto se llama **NexusForge OS**. Lo pensé como una plataforma web donde los estudiantes de ingeniería desarrollamos nuestros proyectos de clase de forma **visual, interactiva y en tiempo real**: trabajamos por fases, chateamos en vivo con el equipo, subimos de rango compitiendo, y los mejores proyectos se exhiben ante **empresas reales de Honduras** que pueden contratarnos o comprar nuestro software.

No quiero reemplazar a Canvas; lo que quiero es **complementarlo** con una capa visual, gamificada y profesional que resuelve dos dolores que yo misma he vivido:
1. **Como estudiante:** organizar el proyecto, no perder el hilo y construir un portafolio sin esfuerzo extra.
2. **Pensando en el catedrático:** dejar de ahogarse en correos, WhatsApp y PDFs, y poder saber **quién hizo qué y cuándo**.

---

## 2. El problema que vi y mi solución

### El problema
Me di cuenta de que en los proyectos largos (los de tres parciales) todo se vuelve un caos: los entregables quedan dispersos, el GitHub por un lado, los PDFs por otro. El profesor siempre escucha el clásico *"Ingeniero, todos trabajamos"* y no tiene cómo comprobarlo. Y encima, las plataformas educativas son aburridas: no motivan ni muestran nuestro talento al mundo.

### Mi solución
Decidí juntar todo en una sola plataforma con **cuatro mundos**:

| Pilar | Qué es |
|---|---|
| **La Fragua** (privado) | Donde trabajamos el proyecto por fases, con chat y tablero. |
| **La Arena** (semi-público) | Donde los proyectos compiten: rangos, duelos, leaderboard. |
| **La Academia** (siempre activa) | Aprendizaje, retos y quizzes — incluso si aún no tengo proyecto. |
| **La Vitrina** (público) | Donde los mejores proyectos se exhiben a empresas. |

---

## 3. Mercado, nicho y cómo genera dinero

### A quién va dirigido
- **Nicho:** la educación superior técnica / ingeniería en Honduras (y quiero que a futuro crezca a LATAM).
- **Usuarios:** estudiantes, catedráticos, empresas tecnológicas y público general.

### Cómo pienso monetizarlo (lo pide el proyecto)
1. **Comisión por vinculación:** cobro un porcentaje cuando una empresa contrata o compra un proyecto.
2. **Freemium:** rangos/insignias premium, más almacenamiento y estadísticas avanzadas de pago.
3. **Suscripción institucional (B2B):** las universidades pagan una licencia.
4. **Reclutamiento Premium:** las empresas pagan por filtrar talento por especialización.
5. **Publicidad segmentada** y un **Pase de Temporada** (cosméticos e insignias).
6. **Afiliados:** cursos y herramientas para estudiantes.

---

## 4. Los modos de usuario que diseñé

### Estudiante (mi rol principal)
- Me registro con mi **carrera, periodo y las clases** que curso.
- Armo grupo anotando a mis compañeros por código, o trabajo individual.
- Tomo un proyecto del pool del ingeniero o propongo uno (Modo Creativo Libre).
- Subo entregables, uso el tablero, chateo en vivo, gano XP/NR y subo de rango.
- Voy construyendo mis **Especializaciones** (Backend, Linux, DevOps...).

### Catedrático (Ingeniero)
- Crea su perfil y **vincula sus asignaturas** del periodo.
- Define las **fases** (semanas o parciales).
- Sube un pool de proyectos (PDF) o activa el **Modo Creativo Libre**.
- Activa **Duelos** entre grupos.
- Usa su **Centro de Control** para monitorear, aprobar requisitos y calificar.

### Visitante / Empresa
- Entra sin login obligatorio a **La Vitrina**.
- Ve los proyectos en rango alto (Oro/Diamante).
- Filtra talento por especialización, da likes, comenta y guarda favoritos.
- Usa el botón **"Cotizar / Contactar Equipo"**, que manda un correo seguro al grupo.

---

## 5. Los módulos y funciones que va a tener

### 5.1 Dashboard (Perfil + Grid)
Quiero que al entrar vea mi **tarjeta de perfil** (avatar, nivel, rango, barra de XP/NR, trofeos, especializaciones y mini-stats) y a la derecha un **grid de cartas** para entrar rápido a cada sección.

### 5.2 Mi Proyecto (Tablero)
Un pipeline visual estilo Jira: **fases y tareas**, con estados *Aprobada*, *En curso*, *Por corregir* y *Pendiente*. Yo subo entregables y el ingeniero aprueba o rechaza en vivo.

### 5.3 La Arena
El **leaderboard** de la temporada (por clase, carrera y global), el **Rey de la Clase** (el proyecto con más NR) y los **Duelos** y **Torneos** entre grupos.

### 5.4 La Academia
**Retos técnicos**, **quizzes** entre amigos que dan XP/NR, y la **Sala de Estudio** por clase. Aquí entro a aprender aunque todavía no tenga proyecto.

### 5.5 Línea del Tiempo
La **biografía visual** de mi proyecto: cada archivo que subo, cada aprobación, commit, mensaje y subida de rango, en orden. Se alimenta de los **logs de auditoría del servidor Linux**.

### 5.6 Repositorio
El árbol de archivos en el **servidor Linux**, organizado por `clase/grupo/fase`, con **auditoría** de quién subió qué y cuándo, e integración con **GitHub**.

### 5.7 Chat Técnico (tiempo real)
Mensajería en vivo por hilos (WebSocket / Socket.IO), con presencia (quién está conectado) y notificaciones instantáneas.

### 5.8 Centro de Control del Catedrático
Un panel con **semáforos** por grupo (al día, en riesgo, atrasado), contadores de dudas/entregas/duelos, y la **trazabilidad** para ver quién hizo qué.

### 5.9 Vitrina
La galería pública tipo Behance/LinkedIn de ingeniería, con filtro de talento y botón de **Cotizar/Contactar**. Cada proyecto tiene su **ficha técnica** (stack, problema, demo, repo).

### 5.10 Configuración
Tema **Claro / Oscuro** y preferencias (notificaciones, sonido del chat, resumen por correo, idioma).

---

## 6. Mi sistema de gamificación (lo que lo hace "no aburrido")

### 6.1 Doble moneda
Diseñé **dos monedas** a propósito:
- **XP (Experiencia) = actividad.** Sube rápido. Sirve para el nivel y los cosméticos.
- **NR (Nexus Reputation) = prestigio.** Sube lento, por **calidad, innovación, ayudar a otros y participación**.

**Mi regla de oro:** el **rango** y el **Top Global** se calculan por **NR, no por XP**. Así nadie hace trampa subiendo tareas vacías; lo que premia es el trabajo real.

### 6.2 Rangos (por NR)
Mena → Hierro → Acero → Oro *(entra a la Vitrina)* → Diamante *(recibe cotizaciones)* → Legendario *(Top Global)*.

### 6.3 Temporadas
Cada periodo es una **Temporada** (ej. "Temporada 1 - Innovación 2026"). Al terminar, el ranking se reinicia, pero **conservo** mis insignias, mi NR histórica, mis logros y la Línea del Tiempo.

### 6.4 Especializaciones
Mi perfil va desarrollando especializaciones (Backend, Linux, DevOps, Cyberseguridad...) según los proyectos que completo, y **las empresas filtran talento** por ellas.

### 6.5 Modos competitivos
**Duelo** (dos grupos, misma idea, gana la mejor arquitectura), **Torneo**, **Rey de la Clase** y **Top Global**.

---

## 7. Con qué lo voy a construir (lenguajes y stack)

| Capa | Tecnología | Lenguaje |
|---|---|---|
| **Frontend** | Next.js | TypeScript / React |
| **Backend / API** | NestJS (Node.js) | TypeScript |
| **Tiempo real** | Socket.IO (WebSocket) | TypeScript |
| **Base de datos** | PostgreSQL | SQL |
| **Servicio de IA** | FastAPI | Python |
| **Servidor** | Ubuntu Server (Linux) | — |
| **Control de versiones** | GitHub | — |

Elegí este stack porque es **moderno, muy demandado en el mercado** y encaja perfecto con Sistemas Abiertos: todo corre sobre un **servidor Linux** y usa tecnologías open source.

### Cómo se conecta todo (arquitectura)

```
[ Cliente (Next.js) ]  <--- HTTP/REST --->  [ Backend NestJS ]  <-->  [ PostgreSQL ]
        |                                          |
        +---------- WebSocket (Socket.IO) ---------+
                                                   |  (HTTP interno)
                                          [ Microservicio IA - FastAPI ]

                   Todo desplegado en  ->  Ubuntu Server (Linux)
```

---

## 8. Cómo voy a organizar mis datos (modelo de datos)

- **Usuario** (id, nombre, email, rol, carrera, código, xp, nr)
- **Especializacion** (id, id_usuario, tipo, nivel)
- **Clase/Asignatura** (id, nombre, periodo, id_catedrático, id_temporada)
- **Proyecto** (id, título, descripción, id_clase, estado, rango, nr_total)
- **Grupo** (id, id_proyecto, integrantes[])
- **Fase** (id, id_proyecto, nombre, fecha_límite, estado)
- **Tarea/Requisito** (id, id_fase, descripción, estado)
- **Mensaje** (id, id_chat, id_usuario, texto, timestamp)
- **Archivo** (id, id_proyecto, nombre, ruta, subido_por, timestamp) — auditoría
- **Cotización** (id, id_proyecto, id_empresa, mensaje, estado)
- **Temporada** (id, nombre, fecha_inicio, fecha_fin, activa)
- **Insignia/Logro** (id, id_usuario, tipo, temporada, fecha)
- **ReputaciónLog** (id, id_usuario, motivo, puntos_nr, fecha)
- **EventoTimeline** (id, tipo, id_actor, id_proyecto, descripción, timestamp)
- **RetoAcademia/Quiz** (id, id_clase, tipo, contenido, recompensa_xp, recompensa_nr)

---

## 9. Lo que va a pasar en vivo (tiempo real)

Usando **WebSocket / Socket.IO**:
- Chateo en vivo por canales/hilos.
- Veo quién está conectado (presencia).
- Me llegan notificaciones al momento ("el Ing. aprobó tu fase").
- El tablero se actualiza solo cuando un compañero mueve una tarea.
- El marcador del Duelo se mueve en vivo.
- Los eventos de la Línea del Tiempo aparecen al instante.
- Los semáforos del Centro de Control se actualizan en vivo.

---

## 10. Cómo funcionaría paso a paso

### Cuando entro como estudiante
1. Abro la plataforma e inicio sesión como **Estudiante**.
2. Llego a mi **Dashboard** (mi perfil + el grid de cartas).
3. Entro a **Mi Proyecto**, veo mis fases y subo un entregable.
4. El archivo queda **auditado** y aparece en mi **Línea del Tiempo**.
5. Chateo en vivo con mi equipo para coordinarnos.
6. El ingeniero aprueba una fase, me llega la **notificación + XP/NR** y a veces **subo de rango**.
7. Si me sobra tiempo, entro a **La Academia** y gano NR con retos.

### Cuando el catedrático entra
1. Inicia sesión como **Catedrático** y llega a su **Centro de Control**.
2. Ve sus clases y el **semáforo** de cada grupo.
3. Entra a un grupo atrasado, deja un comentario y marca un requisito "Por corregir".
4. Activa un **Duelo** entre dos grupos con la misma idea.
5. Revisa la **trazabilidad** para saber quién aportó qué.

### Cuando una empresa entra
1. Abre **La Vitrina** (sin necesidad de login).
2. Filtra por tecnología/especialización (ej. Linux, Backend).
3. Encuentra un proyecto Diamante, le da like y comenta.
4. Presiona **"Cotizar / Contactar Equipo"** y nos llega un correo seguro.

---

## 11. Alcance: lo que voy a construir primero (MVP)

Como el proyecto es grande, lo voy a desarrollar por capas. Primero el **núcleo funcional** y después lo extra.

**Núcleo (esencial):**
- Registro/login con los 3 roles.
- CRUD de proyectos y fases.
- Tablero visual de tareas (aprobado / por corregir).
- **Chat en vivo por WebSocket**.
- Subida de archivos al servidor + **auditoría**.
- Línea del Tiempo (alimentada por la auditoría).
- Centro de Control básico del ingeniero.
- Base de datos conectada (PostgreSQL).

**Opcional (lo extra, si me alcanza el tiempo):**
- Doble moneda XP/NR + rangos.
- Especializaciones + filtro de talento.
- Temporadas y modos competitivos (duelo, torneo, rey de clase).
- La Academia (retos, quizzes, sala de estudio).
- Vitrina pública + botón Cotizar.
- Microservicio de IA (FastAPI) para recomendaciones/quizzes.

---

## 12. Mi plan por parciales

### Parcial 1 — Planificación y Diseño (5 pts)
Mi informe (este documento), el estado del arte, el benchmarking, el nicho, la **monetización** y la viabilidad. Más la arquitectura, el modelo de datos y los **wireframes/mockups** del diseño. Y el PowerPoint + el video de 10 min. *(Sin código todavía: bajo riesgo, buena nota.)*

### Parcial 2 — Desarrollo (10 pts)
Crear el repo en GitHub y el entorno (Next.js / NestJS / PostgreSQL). Construir el **núcleo (MVP)**: login de 3 roles + tablero + **chat con Socket.IO** + base de datos + subida con auditoría + Línea del Tiempo. Y presentar una demo funcional.

### Parcial 3 — Despliegue (15 pts)
Subir todo a **Ubuntu Server**, agregar lo extra (XP/NR, especializaciones, temporadas, modos, vitrina, IA) según el tiempo, y entregar el manual de usuario, el manual de aplicación y la presentación final.

> **Mi plan B seguro:** si se me complica, recorto a "chat WebSocket + ranking" (que es la idea #6 del PDF, ya aprobada por el ingeniero). Arrancando con NexusForge siempre puedo recortar; al revés no.

---

## 13. Mis próximos pasos

- [ ] Diseñar los **wireframes/mockups** de cada pantalla.
- [ ] Dibujar el **diagrama entidad-relación** completo.
- [ ] Investigar 2 o 3 competidores reales para el benchmarking.
- [ ] Definir el balance exacto de puntos XP vs NR.
- [ ] Configurar el repo y el entorno de desarrollo para el Parcial 2.

---

> Este es mi documento de referencia del proyecto. Mi lluvia de ideas y notas de trabajo están en `NexusForge_OS.md`.
