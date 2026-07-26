import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
import { ollamaBase, ollamaModel, ollamaOptions } from '@/backend/ollama'

/**
 * PRE-CALIFICACIÓN CON IA. Recibe el enunciado (con su rúbrica) y lo que el
 * alumno entregó, y SUGIERE una nota sobre `points` con una retroalimentación.
 *
 * Es una SUGERENCIA, no la nota final: el catedrático la revisa, la ajusta y la
 * confirma. Una nota es de alto riesgo y el modelo se equivoca; por eso nunca se
 * guarda sola desde aquí. La devolvemos y ya.
 *
 * Seguridad: exige sesión iniciada y limita el uso.
 */
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX = 9000

/** Saca el primer número (la nota) de la respuesta del modelo, acotado a [0, max]. */
function parseScore(s: string, max: number): number | null {
  const m = s.match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(max, Math.round(n * 10) / 10))
}

export async function POST(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`grade:ip:${ip}`, 20, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })

  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const byUser = rateLimit(`grade:user:${user.id}`, 12, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: { enunciado?: string; entrega?: string; points?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const enunciado = (body.enunciado ?? '').trim().slice(0, MAX)
  const entrega = (body.entrega ?? '').trim().slice(0, MAX)
  const points = Number.isFinite(body.points) && (body.points as number) > 0 ? (body.points as number) : 100

  if (!entrega) {
    return NextResponse.json({ error: 'Esta entrega no tiene texto que la IA pueda revisar.' }, { status: 400 })
  }

  const system = [
    'Eres un catedrático calificando una entrega. Sé justo, exigente y honesto.',
    `La tarea vale ${points} puntos. Evalúa la ENTREGA contra el ENUNCIADO y su rúbrica.`,
    'Responde SIEMPRE en español, EXACTAMENTE en este formato y nada más:',
    `NOTA: <número de 0 a ${points}>`,
    'FORTALEZAS: <una o dos frases>',
    'A MEJORAR: <una o dos frases>',
    'Basa la nota SOLO en lo que el alumno entregó. Si la entrega está casi vacía o no corresponde, pon una nota baja.',
  ].join('\n')

  const userMsg = `ENUNCIADO Y RÚBRICA:\n${enunciado || '(sin enunciado)'}\n\n---\nENTREGA DEL ESTUDIANTE:\n${entrega}`

  try {
    const r = await fetch(`${ollamaBase()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        keep_alive: '30m',
        options: ollamaOptions({ temperature: 0.2, num_predict: 300 }),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
      signal: AbortSignal.timeout(280_000),
    })
    if (!r.ok) return NextResponse.json({ error: `El servidor de IA respondió ${r.status}.` }, { status: 502 })

    const data = await r.json()
    const answer = (data?.message?.content ?? '').trim()
    if (!answer) return NextResponse.json({ error: 'La IA no devolvió respuesta.' }, { status: 502 })

    const score = parseScore(answer, points)
    return NextResponse.json({ suggestion: answer, score })
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'TimeoutError'
        ? 'La IA tardó demasiado en responder.'
        : 'No se pudo conectar con la IA.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
