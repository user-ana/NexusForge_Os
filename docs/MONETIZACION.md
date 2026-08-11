---
noteId: "8543af9095b911f194c22d32e32ad913"
tags: []

---

# Estrategia de monetización y costos

**Asignatura:** Programación para Sistemas Abiertos II · **Etapa:** Tercer Parcial

> Punto 2 de la presentación final: *"Estrategia de monetización: ¿Qué cuesta mi aplicación? Comparación con algo equivalente en el mercado."*

Este documento continúa —no reemplaza— la sección 1.4 del informe del Primer Parcial, donde se
plantearon cuatro vías de ingreso: licencia institucional B2B, plan premium para estudiantes,
vinculación con empresas y publicidad segmentada. Aquí se les ponen números.

> **Sobre las cifras.** Los precios de Vercel, Supabase y las APIs de IA están verificados a agosto
> de 2026 (fuentes al final). Los precios de LMS institucionales son rangos públicos: Canvas y
> Blackboard se negocian por contrato y no publican tarifa. Los cálculos de electricidad y los
> excedentes de consumo son **estimaciones propias** y están marcados como tales.
> Tipo de cambio de referencia: **1 USD ≈ 26 lempiras**.

---

## 1. ¿Qué cuesta hoy la aplicación?

### 1.1 Costo actual: cero, con una letra pequeña

| Componente | Plan | Costo |
|---|---|---|
| Aplicación (Next.js) | Vercel Hobby | $0 |
| Base de datos + autenticación | Supabase Free | $0 |
| Asistente de IA | Ollama autohospedado | $0 de licencia |
| Dominio | `nexusforgeos.vercel.app` | $0 |
| **Total** | | **$0 / mes** |

**La letra pequeña importa y conviene decirla en la exposición:** el plan Hobby de Vercel
**prohíbe expresamente los proyectos comerciales**. El costo de hoy no es cero porque la aplicación
consuma poco; es cero porque todavía no se cobra por ella. El día que se monetice, migrar a un plan
de pago no es una optimización opcional: es una obligación contractual.

El plan gratuito de Supabase añade otro límite operativo: **pausa el proyecto tras 7 días de
inactividad**. Para una demo de aula es tolerable; para una institución que depende de la
plataforma, no.

### 1.2 Costo mínimo para operar comercialmente

| Componente | Plan | Costo mensual |
|---|---|---|
| Vercel | Pro — 1 asiento, incluye $20 de crédito de consumo y 1 TB de transferencia | $20 |
| Supabase | Pro — 8 GB de base, 100,000 usuarios activos/mes, respaldos, sin pausa | $25 |
| Dominio propio | `.hn` o `.com`, ~$15/año | $1.25 |
| Asistente de IA | Ollama en servidor propio (ver 1.4) | $0 de licencia |
| **Total** | | **≈ $46 / mes  ·  L 1,200 / mes** |

Ese es el número que responde a la pregunta del profesor: **operar NexusForge OS en producción
comercial cuesta unos 46 dólares al mes**, y ese costo es prácticamente **fijo** hasta los 100,000
usuarios activos mensuales que incluye el plan Pro de Supabase.

### 1.3 El costo por estudiante se desploma con la escala

Aquí está la propiedad económica que define al producto: **el costo no crece con los usuarios, así
que el costo por usuario colapsa.**

| Escala | Infraestructura | Costo/mes | Costo por estudiante/año |
|---|---|---|---|
| 1 clase (40 estudiantes) | Vercel Pro + Supabase Pro | $46 | **$13.80** |
| 1 carrera (500) | igual | $46 | **$1.10** |
| 1 facultad (2,000) | + excedente de transferencia *(est. $15)* | ~$61 | **$0.37** |
| Universidad completa (5,000) | + excedente *(est. $40)* | ~$86 | **$0.21** |

Los excedentes de las dos últimas filas son estimaciones: Vercel cobra $0.15 por GB por encima del
terabyte incluido, y el consumo real depende de cuántas imágenes y archivos muevan los estudiantes.
El punto no es la precisión de esas dos filas, sino la forma de la curva.

**El costo marginal de un estudiante adicional es esencialmente cero.** Esa es la característica que
convierte al software en un negocio de márgenes altos, y es exactamente lo que hay que explicar en
la diapositiva de monetización.

### 1.4 La excepción interesante: la IA

El asistente es el único componente cuyo costo **sí** podría crecer con el uso — y por eso la
decisión de arquitectura de correrlo localmente es la más rentable del proyecto.

Supongamos un intercambio típico con el asistente: unos 1,500 tokens de entrada y 500 de salida.

| Opción | Costo por intercambio | 10,000 intercambios/mes | ¿Crece con el uso? |
|---|---|---|---|
| API en la nube (modelo tope de gama) | $0.020 | **$200 / mes** | Sí, linealmente |
| API en la nube (modelo económico) | $0.004 | **$40 / mes** | Sí, linealmente |
| **Ollama autohospedado (lo que usamos)** | $0 de API | **≈ $18 / mes de electricidad** *(est.)* | **No** |

Diez mil intercambios al mes son unos 20 por estudiante en una carrera de 500.

La estimación eléctrica: un servidor consumiendo ~150 W las 24 horas gasta unos 108 kWh al mes; a
una tarifa aproximada de L 4.50/kWh son unos L 486 ≈ $18. Y ese gasto es **de la máquina completa**,
no por usuario: atiende a 40 estudiantes o a 5,000 por el mismo precio.

> **El argumento para la exposición:** correr el modelo en el servidor Linux propio no fue una
> decisión de comodidad, fue una decisión económica. Convierte el único costo variable del sistema
> en un costo fijo. Con la API en la nube, duplicar los usuarios duplica la factura de IA; con el
> modelo local, duplicar los usuarios no cambia nada.
>
> **Y hay que decir también el precio que se paga por eso:** un modelo de 3 mil millones de
> parámetros corriendo en local no da la calidad de respuesta de un modelo de frontera, y alguien
> tiene que administrar el servidor. Es un intercambio consciente entre costo, calidad y trabajo
> operativo — no una victoria gratuita.

---

## 2. Comparación con el mercado

### 2.1 Qué cuesta lo equivalente

| Plataforma | Precio público | Qué cubre |
|---|---|---|
| **Google Classroom** (Education Fundamentals) | Gratis | Tareas y entregas. Sin tiempo real, sin Kanban, sin gamificación |
| **Google Workspace for Education Plus** | $6 por usuario/año, **mínimo 50 licencias** | Classroom + Meet + almacenamiento |
| **Canvas LMS** | $5–15 por estudiante/año negociado; $50,000–200,000/año institucional | LMS completo |
| **Blackboard Learn** | Desde ~$9,500/año | LMS completo |
| **Moodle** | Software gratis; MoodleCloud desde ~$200/año | LMS autohospedado, requiere personal de TI |
| **Trello** Standard | $5 por usuario/mes = **$60/año** | Solo tablero de tareas |
| **Slack** Pro | $7.25 por usuario/mes ≈ **$87/año** | Solo chat |

### 2.2 La comparación honesta

Comparar NexusForge OS contra Canvas o Blackboard sería deshonesto: son LMS maduros con años de
desarrollo, integraciones y soporte. **La comparación correcta es contra la pila de herramientas que
los estudiantes usan hoy en paralelo**, que es justamente el problema que el proyecto ataca —
el mismo argumento del benchmarking del Primer Parcial.

**Lo que hoy se usa por separado, valorado a precio de mercado, por estudiante y por año:**

| Herramienta actual | Función | Precio/año |
|---|---|---|
| Google Classroom | Tareas | $0 |
| Trello Standard | Tablero Kanban | $60 |
| Slack Pro | Chat de equipo | $87 |
| GitHub Classroom | Repositorios | $0 |
| **Total del apilado** | | **$147 por estudiante/año** |

**NexusForge OS a escala universitaria: $0.21 por estudiante/año de infraestructura.**

Esa diferencia no significa que el producto valga $147: significa que **hay muchísimo espacio entre
el costo y el precio del mercado**, y ese espacio es el margen. La lección de negocio que conviene
enunciar en la presentación es precisamente esa: **el precio no se fija según lo que cuesta
producir, sino según el valor que entrega y lo que cuesta la alternativa.**

### 2.3 Lo que ninguna de las alternativas tiene

Justifica cobrar en vez de regalar:

- **Chat en tiempo real integrado al aula**, no una herramienta aparte.
- **Capa gamificada** (XP, rangos, retos) atada al trabajo académico real.
- **Asistente de IA con el contexto de la clase**, sin costo por consulta.
- **Panel de monitoreo** del propio sistema (ver [MONITOREO.md](MONITOREO.md)).
- **Autohospedable en un servidor Linux propio** — dato relevante para instituciones públicas con
  políticas de soberanía de datos, que es un argumento de venta real en el sector educativo.

---

## 3. Estrategia de monetización propuesta

Cuatro vías, ordenadas por lo que realmente conviene priorizar.

### 3.1 Licencia institucional B2B — la principal

Es la vía correcta para este producto: quien tiene presupuesto es la institución, no el estudiante.

| Escala | Precio sugerido | Ingreso anual | Costo anual | Margen |
|---|---|---|---|---|
| Carrera (500 estudiantes) | $2 / estudiante / año | $1,000 | $552 | 45 % |
| Facultad (2,000) | $2 / estudiante / año | $4,000 | $732 | 82 % |
| Universidad (5,000) | $1.50 / estudiante / año | $7,500 | $1,032 | 86 % |

A $1.50–2.00 por estudiante al año, NexusForge OS queda **por debajo del piso de Canvas** ($5) y
**por debajo de Google Workspace for Education Plus** ($6), que además exige un mínimo de 50
licencias. Es un precio con el que un decano puede decir que sí sin pasar por un comité de compras.

El margen sube con la escala porque el costo casi no se mueve. Ese es el gráfico que conviene poner
en la diapositiva: dos líneas, ingreso creciendo en diagonal y costo casi plano.

### 3.2 Freemium para catedráticos individuales — la vía de entrada

La licencia institucional se vende lento; un catedrático adopta en un día. El plan gratuito es el
canal de distribución que después justifica la venta institucional.

| Plan | Precio | Incluye |
|---|---|---|
| **Gratis** | $0 | 1 clase, hasta 40 estudiantes, Kanban, chat, tareas |
| **Docente** | $5 / mes | Clases ilimitadas, asistente de IA, panel de monitoreo, exportación de notas |
| **Institucional** | Por estudiante/año | Todo lo anterior + administración central, marca propia, autohospedaje |

### 3.3 Vinculación con empresas — el diferenciador

Es la vía que ninguna de las plataformas comparadas puede ofrecer, porque ninguna tiene el dato: la
gamificación genera un historial verificable de desempeño en proyectos reales de ingeniería. Una
empresa que recluta desarrolladores junior en Honduras hoy no tiene forma de distinguir entre
currículos; aquí hay proyectos, entregas puntuales y evaluaciones del catedrático.

Modelo: suscripción de reclutador para acceder a la galería de proyectos y a estudiantes destacados,
**siempre con consentimiento explícito del estudiante**. Es un ingreso de mayor valor por cliente que
la licencia académica, pero requiere volumen de usuarios primero — por eso va en tercer lugar,
no en el primero.

### 3.4 Publicidad segmentada — no recomendada

Estaba en el informe del Primer Parcial y conviene revisarla honestamente en vez de arrastrarla:

- Con unos pocos miles de usuarios, el ingreso publicitario sería de pocos dólares al mes.
- Degrada la experiencia en un producto que se usa para estudiar.
- Choca frontalmente con el argumento de venta institucional de soberanía de datos.

**Recomendación: descartarla explícitamente.** Reconocer que una idea del informe inicial no
sobrevivió al análisis de costos es un punto a favor en la exposición, no en contra: demuestra que
el análisis se hizo de verdad.

### 3.5 Plan premium para estudiantes — de baja prioridad

También venía del Primer Parcial. El problema no es la idea, es el segmento: la disposición a pagar
de un estudiante universitario en Honduras por una herramienta que su universidad ya le da es baja.
Conviene mantenerla como experimento posterior (cosméticos de perfil, almacenamiento extra), nunca
como fuente de ingreso principal, y **jamás** cobrando por funcionalidad académica — eso crearía
desigualdad dentro del aula.

---

## 4. Viabilidad: el punto de equilibrio

Con un costo fijo de ~$46/mes ($552/año), el punto de equilibrio es:

- **9 catedráticos** en el plan Docente de $5/mes, o
- **1 sola carrera** de 300 estudiantes a $2/estudiante/año, o
- **1 contrato institucional** de cualquier tamaño razonable.

Un único departamento universitario que adopte la plataforma cubre el costo de operación completo.
Ese es el argumento de viabilidad económica: **el negocio no necesita escala para sobrevivir, solo
para crecer.**

---

## 5. Visión a futuro

Punto 3 de la presentación final, junto con el monitoreo.

**Corto plazo (0–6 meses).** Cerrar los pendientes del Tercer Parcial; validar con una clase real
durante un período completo; instrumentar la retención con el panel de monitoreo que ya existe —
las métricas de uso son la evidencia que se le enseña al primer cliente institucional.

**Mediano plazo (6–18 meses).** Primer contrato institucional. Aplicación móvil (el marco del curso
la contempla explícitamente). Integración real con GitHub para que el avance del proyecto se mida
solo desde los commits. Panel de entregas y calificación asistida para el catedrático.

**Largo plazo.** Portal de reclutadores sobre la base de proyectos acumulados. Modo autohospedado
empaquetado — el script [`deploy-rocky.sh`](../scripts/deploy-rocky.sh) ya es el primer paso hacia
un instalador que una institución pueda ejecutar en su propia infraestructura, que es justamente lo
que abre el mercado de instituciones públicas.

**El riesgo principal, dicho con honestidad:** la plataforma depende de que el catedrático la adopte.
Sin él no hay clase, y sin clase no hay estudiantes. Por eso el plan gratuito para docentes no es
generosidad, es la estrategia de distribución.

---

## Fuentes

Precios verificados en agosto de 2026:

- [Vercel Pricing 2026](https://comparedge.com/tools/vercel/pricing) — Hobby gratis (sin uso comercial), Pro $20/usuario/mes
- [Vercel: costo real](https://makerkit.dev/blog/saas/vercel-cost) — transferencia adicional a $0.15/GB
- [Supabase Pricing 2026](https://uibakery.io/blog/supabase-pricing) — Free (500 MB, 50k MAU, pausa a los 7 días), Pro $25/mes (8 GB, 100k MAU)
- [Canvas LMS Pricing 2026](https://raccoongang.com/blog/canvas-lms-pricing/) — $5–15 por estudiante/año
- [Moodle vs Canvas vs Blackboard 2026](https://blog.moodiycloud.com/moodle-vs-canvas-vs-blackboard-2026) — Blackboard desde ~$9,500/año; Moodle gratis autohospedado
- [Google Workspace for Education](https://knowledge.workspace.google.com/admin/getting-started/editions/google-workspace-for-education-pricing-and-licensing) — Education Plus $6/usuario/año, mínimo 50 licencias
- Precios de API de IA: Claude Opus 5 a $5/$25 por millón de tokens (entrada/salida); Claude Haiku 4.5 a $1/$5
