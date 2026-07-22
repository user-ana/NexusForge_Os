import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Redacción con IA (generativa). Recibe una instrucción y devuelve el texto que
 * la IA escribe. Se usa para que el asistente REDACTE la explicación de una
 * tarea/proyecto para los estudiantes a partir de lo que pidió el catedrático.
 *
 * Seguridad: exige sesión y limita el uso (generar texto es costoso en CPU).
 * Si la IA no responde a tiempo, devuelve texto vacío (el flujo sigue sin bloquear).
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_PROMPT = 2000

export async function POST(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`aiwrite:ip:${ip}`, 20, 60 * 1000)
  if (!byIp.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const byUser = rateLimit(`aiwrite:user:${user.id}`, 12, 60 * 1000)
  if (!byUser.ok) return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })

  let body: { prompt?: string; system?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }
  const prompt = (body.prompt ?? '').trim().slice(0, MAX_PROMPT)
  if (prompt.length < 4) return NextResponse.json({ error: 'Instrucción vacía.' }, { status: 400 })

  const system =
    (body.system ?? '').trim() ||
    'Eres un asistente docente que redacta enunciados claros y motivadores para estudiantes universitarios de ingeniería. Escribe en español, directo y bien estructurado. No inventes fechas ni datos que no te den.'

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
        options: { temperature: 0.3, num_predict: 260 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    })
    if (r.ok) {
      const data = await r.json()
      const text = (data?.message?.content ?? '').trim()
      if (text) return NextResponse.json({ text, source: 'ai' })
    }
  } catch (e) {
    console.error('ai-write', e)
  }
  // La IA no respondió: devolvemos vacío para no bloquear el flujo.
  return NextResponse.json({ text: '', source: 'none' })
}
