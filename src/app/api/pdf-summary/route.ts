import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Resume el texto de un enunciado con la IA (Ollama/Llama).
 *
 * El PDF se lee EN EL NAVEGADOR (pdfjs), que es donde funciona de forma
 * confiable; aquí solo llega el texto ya extraído. Así evitamos la fragilidad
 * de parsear PDFs en el entorno serverless.
 *
 * Red de seguridad: si la IA no responde a tiempo (el túnel), devolvemos un
 * extracto del propio texto. La descripción SIEMPRE se llena: no falla la demo.
 *
 * Seguridad: exige sesión iniciada y limita el uso.
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_TEXT = 8000 // caracteres que le pasamos a la IA (rápido en CPU)

export async function POST(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`pdf:ip:${ip}`, 15, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const byUser = rateLimit(`pdf:user:${user.id}`, 10, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }
  const raw = (body.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (raw.length < 20) {
    return NextResponse.json({ error: 'El texto es demasiado corto para resumir.' }, { status: 400 })
  }

  const clipped = raw.slice(0, MAX_TEXT)
  const fallback = raw.slice(0, 700).trim() + (raw.length > 700 ? '…' : '')

  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const model = process.env.OLLAMA_MODEL || 'llama3.2'
  try {
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: '30m',
        options: { temperature: 0.2, num_predict: 220 },
        messages: [
          {
            role: 'system',
            content:
              'Eres asistente docente. Resume el enunciado de tarea que te dan en 2 a 4 frases claras y directas para estudiantes, en español. Menciona qué deben entregar si el texto lo dice. NO inventes datos que no estén en el texto.',
          },
          { role: 'user', content: clipped },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    })
    if (r.ok) {
      const data = await r.json()
      const summary = (data?.message?.content ?? '').trim()
      if (summary) return NextResponse.json({ summary, source: 'ai' })
    }
  } catch (e) {
    console.error('pdf-summary ai', e)
  }

  return NextResponse.json({ summary: fallback, source: 'extract' })
}
