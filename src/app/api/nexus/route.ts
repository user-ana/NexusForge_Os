import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
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
const MAX_IMAGE = 4_000_000 // ~4 MB en base64

export async function POST(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`nexus:ip:${ip}`, 30, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })

  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const byUser = rateLimit(`nexus:user:${user.id}`, 20, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: {
    question?: string
    role?: string
    context?: string
    contextLabel?: string
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
  const esProfe = body.role === 'teacher'
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
    'No inventes datos de la plataforma (clases, notas, estudiantes): no los conoces desde aquí.',
    'Si adjuntan un archivo o imagen, apóyate en su contenido.',
  ]

  const adjunto = context
    ? ['', `CONTENIDO ADJUNTO${contextLabel ? ` (${contextLabel})` : ''}:`, context]
    : []

  const system = [...persona, ...reglas, ...adjunto].join('\n')

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
        stream: false,
        keep_alive: '30m',
        options: ollamaOptions({ temperature: 0.4, num_predict: 500 }),
        messages: [{ role: 'system', content: system }, ...history, userMsg],
      }),
      signal: AbortSignal.timeout(280_000),
    })
    if (!r.ok) return NextResponse.json({ error: `El servidor de IA respondió ${r.status}.` }, { status: 502 })

    const data = await r.json()
    const answer = (data?.message?.content ?? '').trim()
    if (!answer) return NextResponse.json({ error: 'La IA no devolvió respuesta.' }, { status: 502 })
    return NextResponse.json({ answer })
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'TimeoutError'
        ? 'La IA tardó demasiado en responder.'
        : 'No se pudo conectar con la IA (¿Ollama está corriendo?).'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
