import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
import { withMetrics } from '@/backend/metrics'
import { ollamaBase, ollamaModel, ollamaOptions, ollamaHeaders } from '@/backend/ollama'

/**
 * TRADUCTOR del asistente Nexus. Traduce un texto a otro idioma con la IA local
 * (Ollama/Llama), de forma natural: mantiene el tono y el sentido, sin explicar
 * ni añadir comentarios. Lo usan dos modos de la página del asistente:
 *   - "Traducir": el usuario escribe/habla y elige el idioma destino.
 *   - "Conversación en vivo": otra persona habla en inglés (u otro idioma) y se
 *     traduce al español al vuelo para responder sin fricción.
 *
 * Por qué en el servidor y no un servicio externo: reutiliza el mismo modelo que
 * ya corre en el equipo (privado y sin costo por token), con las mismas defensas
 * de las otras rutas de IA.
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_TEXT = 4000

// Instrumentado para el panel de monitoreo (ver src/backend/metrics.ts)
export const POST = withMetrics('/api/translate', handler)

async function handler(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`translate:ip:${ip}`, 40, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })

  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const byUser = rateLimit(`translate:user:${user.id}`, 30, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: { text?: string; to?: string; from?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const text = (body.text ?? '').trim().slice(0, MAX_TEXT)
  const to = (body.to ?? 'español').trim().slice(0, 40) || 'español'
  const from = (body.from ?? '').trim().slice(0, 40)
  if (!text) return NextResponse.json({ error: 'Falta el texto a traducir.' }, { status: 400 })

  const system = [
    'Eres un traductor profesional. Traduces con naturalidad, como un hablante nativo.',
    `Traduce el texto del usuario ${from ? `del ${from} ` : ''}al ${to}.`,
    'Conserva el tono, el registro y el sentido. Adapta modismos para que suene natural.',
    'Devuelve ÚNICAMENTE la traducción, sin comillas, sin notas, sin el texto original y sin explicaciones.',
  ].join('\n')

  try {
    const r = await fetch(`${ollamaBase()}/api/chat`, {
      method: 'POST',
      headers: ollamaHeaders(),
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        keep_alive: '30m',
        // Baja temperatura: una traducción no debe "inventar". num_predict acotado
        // porque la traducción no es mucho más larga que el original.
        options: ollamaOptions({ temperature: 0.2, num_predict: 400 }),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(110_000),
    })
    if (!r.ok) return NextResponse.json({ error: `El servidor de IA respondió ${r.status}.` }, { status: 502 })

    const data = await r.json()
    const translation = cleanup((data?.message?.content ?? '').trim())
    if (!translation) return NextResponse.json({ error: 'La IA no devolvió traducción.' }, { status: 502 })
    return NextResponse.json({ translation })
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'TimeoutError'
        ? 'La traducción tardó demasiado.'
        : 'No se pudo conectar con la IA.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

/** El modelo a veces envuelve la respuesta en comillas o antepone "Traducción:". Lo limpiamos. */
function cleanup(s: string): string {
  return s
    .replace(/^\s*(traducci[oó]n|translation)\s*:\s*/i, '')
    .replace(/^["'«»“”]+|["'«»“”]+$/g, '')
    .trim()
}
