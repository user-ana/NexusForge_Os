import { NextResponse } from 'next/server'
import { requireUserWithRole, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
import { withMetrics } from '@/backend/metrics'
import { ollamaBase, ollamaModel, ollamaOptions, ollamaVisionModel } from '@/backend/ollama'

/**
 * ASISTENTE DE LA LECCIÓN — responde apoyándose EN EL MATERIAL que subió el
 * catedrático (el texto del PDF, extraído en el navegador y guardado en
 * module_files.text_content).
 *
 * Atiende a los dos roles, con criterios opuestos a propósito:
 *   - estudiante -> tutor: guía para que ENTIENDA, y no le resuelve la tarea.
 *   - catedrático -> asistente de cátedra: sí produce material listo para usar
 *     (preguntas de examen, borradores de tarea, huecos del temario).
 *
 * La diferencia con /api/assistant: aquí la IA no ejecuta acciones ni conoce
 * las clases; solo trabaja sobre el material recibido. Si algo no está en él
 * lo dice, en vez de inventarlo.
 *
 * Seguridad: exige sesión iniciada y limita el uso (la IA no es servicio público).
 */
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_TEXT = 9000 // material que le pasamos (en CPU, más texto = más lento)
const MAX_QUESTION = 1000
const MAX_IMAGE = 4_000_000 // ~4 MB en base64

/** Instrucciones fijas de cada atajo, por rol. */
const PRESETS: Record<string, string> = {
  resumen: [
    'Resume esta lección para mí en este formato exacto, sin añadir nada más:',
    'De qué trata: una frase.',
    'Lo importante: 3 o 4 viñetas con lo que debo entender.',
    'Para repasar: una frase con lo que conviene practicar.',
  ].join('\n'),
  examen: [
    'Con base en el material, redacta 5 preguntas de examen con su respuesta correcta.',
    'Varía la dificultad: dos de recordar, dos de comprender y una de aplicar.',
    'Formato: la pregunta, y debajo "Respuesta:" en una línea.',
  ].join('\n'),
  tarea: [
    'Con base en el material, redacta el enunciado de una tarea para mis estudiantes.',
    'Incluye: qué deben hacer, qué deben entregar y tres criterios de evaluación.',
    'No inventes fechas ni puntajes.',
  ].join('\n'),
  huecos: [
    'Revisa el material como si fueras otro catedrático de la materia.',
    'Dime qué conceptos quedan poco explicados o podrían confundir al estudiante,',
    'y qué convendría reforzar en clase. Sé concreto y breve.',
  ].join('\n'),
}

// Instrumentado para el panel de monitoreo (ver src/backend/metrics.ts)
export const POST = withMetrics('/api/study', handler)

async function handler(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`study:ip:${ip}`, 30, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })

  const user = await requireUserWithRole(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const byUser = rateLimit(`study:user:${user.id}`, 20, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: {
    text?: string
    question?: string
    mode?: string
    title?: string
    image?: string
    history?: { role: string; content: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const material = (body.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT)
  const title = (body.title ?? '').trim().slice(0, 200)
  // Rol resuelto en el servidor (profiles.role), no declarado por el navegador.
  const esProfe = user.role === 'teacher'
  const preset = PRESETS[body.mode ?? '']
  const question = (body.question ?? '').trim().slice(0, MAX_QUESTION)

  // La imagen llega en base64 sin el prefijo data: (lo quita el cliente)
  const image = typeof body.image === 'string' && body.image.length <= MAX_IMAGE ? body.image : ''

  if (!material && !image) {
    return NextResponse.json(
      { error: 'Este módulo todavía no tiene material en texto que la IA pueda leer.' },
      { status: 400 },
    )
  }
  if (!preset && !question) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })

  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-6)
    : []

  const comun = [
    'Responde SIEMPRE en español, claro y directo, sin adornos ni tecnicismos innecesarios.',
    'Apóyate ÚNICAMENTE en el MATERIAL de abajo. Si algo no está ahí, dilo. NUNCA inventes.',
    title ? `La lección se titula: "${title}".` : '',
  ]

  const propias = esProfe
    ? [
        'Eres el asistente de cátedra en NexusForge OS. Ayudas al catedrático a preparar su clase',
        'a partir del material que él mismo subió: preguntas de examen, borradores de tarea,',
        'ideas para explicar mejor y detección de temas flojos.',
        'Habla de tú a tú con un colega docente, no como si le explicaras a un alumno.',
      ]
    : [
        'Eres el tutor de NexusForge OS. Le explicas a un estudiante universitario el material de su clase.',
        'Si algo no está en el material, sugiérele que se lo pregunte a su catedrático.',
        'No des la respuesta de una tarea ya resuelta: guía para que entienda y la resuelva por su cuenta.',
      ]

  const system = [...propias, ...comun, '', 'MATERIAL DE LA CLASE:', material || '(sin texto; guíate por la imagen)']
    .filter(Boolean)
    .join('\n')

  const userMsg = preset ?? question

  // Con imagen se usa el modelo con visión (el de texto no la puede leer).
  const conImagen = !!image
  const model = conImagen ? ollamaVisionModel() : ollamaModel()
  if (conImagen && !model) {
    return NextResponse.json(
      { error: 'Para leer imágenes falta configurar un modelo con visión (OLLAMA_VISION_MODEL).' },
      { status: 501 },
    )
  }

  const mensajeUsuario: Record<string, unknown> = { role: 'user', content: userMsg }
  if (conImagen) mensajeUsuario.images = [image]

  try {
    const r = await fetch(`${ollamaBase()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: '30m',
        // Explicar necesita más margen que una acción, pero acotado: cada token
        // cuesta y el estudiante no espera un ensayo.
        options: ollamaOptions({ temperature: 0.3, num_predict: preset ? 450 : 400 }),
        messages: [{ role: 'system', content: system }, ...history, mensajeUsuario],
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
        : 'No se pudo conectar con la IA.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
