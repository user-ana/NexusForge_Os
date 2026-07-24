import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
import { ollamaBase, ollamaModel, ollamaOptions } from '@/backend/ollama'

/**
 * TUTOR DEL MÓDULO — responde dudas del estudiante APOYÁNDOSE EN EL MATERIAL
 * que subió su catedrático (el texto del PDF, extraído en el navegador y
 * guardado en module_files.text_content).
 *
 * La diferencia con /api/assistant: aquí la IA no ejecuta acciones ni conoce
 * las clases; solo explica, y siempre sobre el material recibido. Si algo no
 * está en el material lo dice en vez de inventarlo, para que el estudiante no
 * estudie con datos que su catedrático nunca dio.
 *
 * Dos modos:
 *   - resumen: qué se ve en la lección y qué debe repasar el alumno.
 *   - pregunta: duda concreta, con memoria de la conversación.
 *
 * Seguridad: exige sesión iniciada y limita el uso (la IA no es servicio público).
 */
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_TEXT = 9000 // material que le pasamos (en CPU, más texto = más lento)
const MAX_QUESTION = 1000

export async function POST(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`study:ip:${ip}`, 30, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })

  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const byUser = rateLimit(`study:user:${user.id}`, 20, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: {
    text?: string
    question?: string
    mode?: string
    title?: string
    history?: { role: string; content: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const material = (body.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT)
  const title = (body.title ?? '').trim().slice(0, 200)
  const resumen = body.mode === 'resumen'
  const question = (body.question ?? '').trim().slice(0, MAX_QUESTION)

  if (!material) {
    return NextResponse.json(
      { error: 'Este módulo todavía no tiene material en texto que la IA pueda leer.' },
      { status: 400 },
    )
  }
  if (!resumen && !question) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })

  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-6)
    : []

  const system = [
    'Eres el tutor de NexusForge OS. Le explicas a un estudiante universitario el material de su clase.',
    'Responde SIEMPRE en español, con lenguaje claro y cercano, sin tecnicismos innecesarios.',
    'Apóyate ÚNICAMENTE en el MATERIAL de abajo. Si algo no está ahí, dilo con honestidad',
    'y sugiere que se lo pregunte a su catedrático. NUNCA inventes.',
    'No des la respuesta de una tarea ya resuelta: guía para que entienda y lo resuelva por su cuenta.',
    title ? `La lección se titula: "${title}".` : '',
    '',
    'MATERIAL DE LA CLASE:',
    material,
  ]
    .filter(Boolean)
    .join('\n')

  // El resumen es una instrucción fija; la pregunta viene del estudiante.
  const userMsg = resumen
    ? [
        'Resume esta lección para mí en este formato exacto, sin añadir nada más:',
        'De qué trata: una frase.',
        'Lo importante: 3 o 4 viñetas con lo que debo entender.',
        'Para repasar: una frase con lo que conviene practicar.',
      ].join('\n')
    : question

  try {
    const r = await fetch(`${ollamaBase()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        keep_alive: '30m',
        // Explicar necesita más margen que una acción, pero acotado: en CPU
        // cada token cuesta y el estudiante no espera un ensayo.
        options: ollamaOptions({ temperature: 0.3, num_predict: resumen ? 300 : 400 }),
        messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: userMsg }],
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
