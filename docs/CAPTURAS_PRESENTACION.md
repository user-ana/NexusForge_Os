---
noteId: "capturas-presentacion-final"
tags: []
---

# Presentación final — capturas pendientes y cómo regenerarla

**Archivo:** [`docs/Presentacion_Final_NexusForge_OS.pptx`](Presentacion_Final_NexusForge_OS.pptx) · 21 diapositivas · 16:9 · para 8 minutos
**Generador:** [`scripts/build-presentacion.py`](../scripts/build-presentacion.py)

La presentación se arma con un script, no a mano. Eso significa que **no hay que pegar las capturas
dentro de PowerPoint**: se guardan con el nombre exacto en `imgs/capturaspage/` y se vuelve a
ejecutar el script; las imágenes entran solas, recortadas y centradas en su marco.

```bash
python scripts/build-presentacion.py
```

Mientras una captura no exista, su diapositiva muestra un marco con el nombre que le toca, así que
la presentación se puede ensayar completa desde ya.

> Si después se quiere retocar algo a mano dentro de PowerPoint, hay que hacerlo **al final**:
> volver a ejecutar el script sobrescribe el archivo y se perderían los retoques manuales.

---

## Las 9 capturas que faltan

Todas van en `imgs/capturaspage/` con **exactamente** ese nombre, en `.png`.

| # | Archivo | Diapositiva | Qué debe salir |
|---|---|---|---|
| 1 | `dashboard-catedratico.png` | 04 Recorrido | Panel principal del catedrático, con sus clases visibles |
| 2 | `aula-kanban.png` | 04 Recorrido | Un aula con sus grupos y el tablero Kanban con tarjetas en las tres columnas |
| 3 | `tareas-estudiante.png` | 04 Recorrido | Vista "Mis tareas" del estudiante, con carpetas por clase y fechas límite |
| 4 | `chat-comunidad.png` | 04 Recorrido | Chat en tiempo real, con varios mensajes de distintos autores |
| 5 | `calificacion.png` | 04 Recorrido | Una entrega calificada por rúbrica, con la nota y la retroalimentación |
| 6 | `asistente.png` | 07 Asistente | Página `/dashboard/asistente` con el robot y una conversación real en pantalla |
| 7 | `vercel-deploy.png` | 10 Producción | Panel de Vercel: el último despliegue marcado como *Production*, con el dominio |
| 8 | `rocky-systemctl.png` | 12 Prueba de Linux | Terminal de Rocky con `systemctl status nexusforge` en verde (`active (running)`) |
| 9 | `monitoreo-panel.png` | 14 Panel | `/dashboard/metrics` completo, después de navegar unos minutos por la aplicación |

### Recomendaciones al tomarlas

- **Ventana del navegador maximizada** y a 100 % de zoom. Los marcos son anchos: una captura de
  ventana pequeña se verá diluida.
- **Con datos reales**, no con la base vacía. Una clase con grupos, tarjetas en el Kanban y mensajes
  en el chat vale mucho más que una pantalla en blanco.
- **Sin datos personales de terceros** visibles (correos, números de cuenta de otros estudiantes).
- Para el panel de monitoreo (#9): navegar dos o tres minutos por la aplicación **antes** de la
  captura, para que los Core Web Vitals ya tengan mediciones y salgan en verde.
- Para la terminal de Rocky (#8): sirve `systemctl status nexusforge` y, si cabe, `nginx` debajo.
  Lo importante es que se lea `active (running)`.

---

## Estructura y tiempos (8 minutos)

Cada diapositiva lleva su guion en las **notas del orador**: se ven en PowerPoint con
*Vista → Notas*, o durante la exposición con la *Vista del moderador* (`Alt` + `F5` para probarla).

| # | Diapositiva | Tiempo |
|---|---|---|
| — | Portada | 0:00 |
| 01 | El problema: cuatro herramientas sueltas | 0:15 |
| 02 | Jerarquía académica y tres roles | 0:45 |
| 03 | Recorrido (capturas) | 1:20 |
| 04 | Con qué está hecha: lenguajes y programas | 1:50 |
| 05 | Arquitectura: dos caminos a los datos + RLS | 2:20 |
| 06 | El asistente de IA | 3:00 |
| 07 | Dónde corre el modelo (túnel, GPU, candado) | 3:30 |
| — | *Divisor: Tercer Parcial* | 4:05 |
| 08 | Producción: dominio y certificado | 4:10 |
| 09 | Servidor propio: Rocky Linux | 4:35 |
| 10 | La prueba de que corre sobre Linux | 5:20 |
| 11 | Monitoreo: las cuatro preguntas | 5:45 |
| 12 | El panel con datos reales | 6:15 |
| 13 | Lo que el monitoreo encontró | 6:35 |
| 14 | Qué cuesta la aplicación | 7:00 |
| 15 | Comparación con el mercado | 7:25 |
| 16 | Estrategia de ingresos y equilibrio | 7:45 |
| 17 | Documentación del parcial | 8:05 |
| 18 | Visión a futuro | 8:20 |
| — | Cierre | 8:35 |

**Si hay que recortar**, las tres primeras candidatas a saltar son la 03 (recorrido, si se hace demo
en vivo), la 06 (asistente, si ya se mostró en la demo) y la 17 (documentación, que se puede
resumir en una frase mientras se pasa).

**Si sobra tiempo o preguntan**, los tres puntos con más profundidad detrás son: el bloqueo de
SELinux en el despliegue (diapositiva 09), los tres hallazgos del monitoreo (13) y el punto de
equilibrio del modelo de negocio (16).

---

## Documentos de respaldo

Todo lo que se afirma en la presentación está documentado, por si el catedrático pregunta:

| Tema de la presentación | Documento |
|---|---|
| Despliegue en Linux, nginx, SELinux, certificados | [DESPLIEGUE_LINUX.md](DESPLIEGUE_LINUX.md) |
| Qué se mide y cómo leer el panel | [MONITOREO.md](MONITOREO.md) |
| Costos, comparación de mercado y estrategia | [MONETIZACION.md](MONETIZACION.md) |
| Arquitectura, seguridad, API, modelo de datos | [MANUAL_APLICACION.md](MANUAL_APLICACION.md) |
