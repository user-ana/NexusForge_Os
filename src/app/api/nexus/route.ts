import { NextResponse } from 'next/server'
import { requireUserWithRole, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
import { withMetrics } from '@/backend/metrics'
import { ollamaBase, ollamaModel, ollamaOptions, ollamaVisionModel } from '@/backend/ollama'

/**
 * NEXUS — conversación general del asistente inmersivo, para AMBOS roles.
 *
 * A diferencia de /api/assistant (que ejecuta acciones del catedrático sobre sus
 * clases) y de /api/study (que solo trabaja sobre el material de una lección),
 * esta ruta es el "copiloto" abierto: explica temas, ayuda a planear, analiza un
 * archivo o una imagen que el usuario adjunta en el chat. No inventa datos de la
 * plataforma ni ejecuta acciones; solo conversa y razona.
 *
 * El tono cambia por rol a propósito:
 *   - estudiante -> tutor: explica y guía para que ENTIENDA (no resuelve por él).
 *   - catedrático -> colega docente: produce material y planes listos para usar.
 *
 * Seguridad: exige sesión iniciada y limita el uso (la IA no es servicio público).
 */
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_QUESTION = 3000
const MAX_CONTEXT = 9000
const MAX_PLATFORM = 12_000 // ficha de clases: más holgada, es texto ya resumido
const MAX_IMAGE = 4_000_000 // ~4 MB en base64

// Instrumentado: withMetrics cronometra la respuesta y la guarda para el
// panel de monitoreo (/dashboard/metrics). Ver src/backend/metrics.ts
export const POST = withMetrics('/api/nexus', handler)

async function handler(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`nexus:ip:${ip}`, 30, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })

  const user = await requireUserWithRole(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const byUser = rateLimit(`nexus:user:${user.id}`, 20, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: {
    question?: string
    context?: string
    contextLabel?: string
    /** Ficha real de las clases del catedrático (clases, alumnos, grupos, notas). */
    platform?: string
    image?: string
    history?: { role: string; content: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const question = (body.question ?? '').trim().slice(0, MAX_QUESTION)
  const context = (body.context ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CONTEXT)
  const contextLabel = (body.contextLabel ?? '').trim().slice(0, 120)
  // El rol lo resuelve el SERVIDOR desde profiles.role, no el navegador. Antes
  // venia en el cuerpo (body.role) y bastaba con mandar "teacher" para recibir
  // el prompt y las herramientas de catedratico.
  const esProfe = user.role === 'teacher'
  // La ficha la arma el cliente con SU propia sesión, así que las políticas RLS
  // deciden qué datos puede leer: el catedrático los de sus clases, el
  // estudiante los suyos. El visitante no tiene datos que consultar.
  const conFicha = esProfe || user.role === 'student'
  const platform = conFicha ? (body.platform ?? '').trim().slice(0, MAX_PLATFORM) : ''
  const image = typeof body.image === 'string' && body.image.length <= MAX_IMAGE ? body.image : ''

  if (!question && !image) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })

  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-6)
    : []

  const persona = esProfe
    ? [
        'Eres Nexus, el copiloto del catedrático en NexusForge OS.',
        'Hablas de colega a colega: propones material listo para usar (explicaciones, ejercicios,',
        'planes de clase, borradores) y das ideas concretas y accionables.',
      ]
    : [
        'Eres Nexus, el tutor del estudiante en NexusForge OS.',
        'Explicas con claridad y paso a paso para que ENTIENDA. Si te piden resolver una tarea,',
        'guías con pistas y ejemplos en vez de dar la respuesta hecha.',
      ]

  const reglas = [
    'Responde en el MISMO idioma en que te escribe el usuario: si te escriben en inglés, responde en inglés; si en español, en español. Ante la duda, español.',
    'Sé claro y directo, sin adornos innecesarios.',
    // La regla cambia según haya o no ficha: sin datos hay que decir que no se
    // saben (y no inventarlos); con datos, hay que usarlos en vez de negarse.
    platform
      ? esProfe
        ? 'Abajo tienes los DATOS REALES de las clases de este catedrático. Úsalos para responder sobre sus clases, estudiantes, grupos, proyectos y notas. Nunca digas que no tienes acceso a esa información: la tienes ahí. Si algo concreto no aparece en los datos, dilo, pero no lo inventes.'
        : 'Abajo tienes los DATOS REALES de ESTE estudiante: sus clases, su grupo, su proyecto, sus tareas y sus notas. Úsalos para responder qué tiene pendiente, qué ya entregó, cuándo vence algo o cómo va. Nunca digas que no tienes acceso: lo tienes ahí. Si algo concreto no aparece, dilo, pero no lo inventes. Son datos solo de esta persona; no sabes nada de sus compañeros más allá de con quiénes comparte grupo.'
      : 'No inventes datos de la plataforma (clases, notas, estudiantes): no los conoces desde aquí.',
    'Si adjuntan un archivo o imagen, apóyate en su contenido.',
  ]

  const datos = platform
    ? ['', esProfe ? 'DATOS REALES DE SUS CLASES:' : 'DATOS REALES DE ESTE ESTUDIANTE:', platform]
    : []

  const adjunto = context
    ? ['', `CONTENIDO ADJUNTO${contextLabel ? ` (${contextLabel})` : ''}:`, context]
    : []

  const system = [...persona, ...reglas, ...datos, ...adjunto].join('\n')

  // Con imagen se usa el modelo con visión (el de texto no la puede leer).
  const conImagen = !!image
  const model = conImagen ? ollamaVisionModel() : ollamaModel()
  if (conImagen && !model) {
    return NextResponse.json(
      { error: 'Para analizar imágenes falta configurar un modelo con visión (OLLAMA_VISION_MODEL, p. ej. llava).' },
      { status: 501 },
    )
  }

  const userMsg: Record<string, unknown> = { role: 'user', content: question || 'Describe y analiza esta imagen.' }
  if (conImagen) userMsg.images = [image]

  try {
    const r = await fetch(`${ollamaBase()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        // En streaming la primera palabra sale en menos de un segundo. Sin él
        // había que esperar a que el modelo generase la respuesta ENTERA (hasta
        // 500 tokens) antes de ver nada, y parecía que no contestaba.
        stream: true,
        keep_alive: '30m',
        options: ollamaOptions({ temperature: 0.4, num_predict: 500 }),
        messages: [{ role: 'system', content: system }, ...history, userMsg],
      }),
      signal: AbortSignal.timeout(280_000),
    })
    if (!r.ok || !r.body) return NextResponse.json({ error: `El servidor de IA respondió ${r.status}.` }, { status: 502 })

    // Ollama emite NDJSON: una línea JSON por trozo. Aquí se reenvía solo el
    // texto, para que el cliente pueda pintarlo tal cual va llegando.
    const source = r.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let rest = ''

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await source.read()
        if (done) {
          controller.close()
          return
        }
        rest += decoder.decode(value, { stream: true })
        const lines = rest.split('\n')
        rest = lines.pop() ?? '' // la última puede venir cortada
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const piece = JSON.parse(line)
            const chunk = piece?.message?.content
            if (chunk) controller.enqueue(encoder.encode(chunk))
          } catch {
            /* línea incompleta o ruido: se ignora */
          }
        }
      },
      cancel() {
        void source.cancel()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'TimeoutError'
        ? 'La IA tardó demasiado en responder.'
        : 'No se pudo conectar con la IA (¿Ollama está corriendo?).'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
