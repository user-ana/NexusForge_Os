import { NextResponse } from 'next/server'

/**
 * Asistente con IA (Fase 3a — solo lectura). Recibe la pregunta del catedrático
 * + un resumen de sus clases (contexto), y se lo pasa a Llama vía Ollama para que
 * responda en lenguaje natural, SIN inventar (RAG). El LLM corre en el servidor
 * Ollama definido por OLLAMA_BASE_URL (local: http://localhost:11434).
 */
export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { question?: string; context?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const question = (body.question ?? '').trim()
  const context = (body.context ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })

  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  // llama3.2 (3B) cabe en GPUs de ~6GB (RTX 4050) -> respuestas rápidas.
  const model = process.env.OLLAMA_MODEL || 'llama3.2'

  const system = [
    'Eres el asistente del catedrático dentro de NexusForge OS (plataforma académica).',
    'Respondes SOLO con base en los DATOS que te doy abajo sobre sus clases. No inventes.',
    'Si el dato no aparece, dilo con claridad. Sé conciso, útil y responde SIEMPRE en español.',
    'Cuando listes estudiantes o grupos, usa viñetas.',
    '',
    'DATOS ACTUALES DE SUS CLASES:',
    context || '(sin datos)',
  ].join('\n')

  try {
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: '30m', // mantiene el modelo cargado en memoria (evita el arranque en frío)
        options: { temperature: 0.2, num_predict: 400 }, // factual + respuesta acotada = más rápido
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question },
        ],
      }),
      // el modelo puede tardar en responder la primera vez
      signal: AbortSignal.timeout(120_000),
    })
    if (!r.ok) {
      return NextResponse.json({ error: `El servidor de IA respondió ${r.status}.` }, { status: 502 })
    }
    const data = await r.json()
    const answer = data?.message?.content?.trim() ?? ''
    if (!answer) return NextResponse.json({ error: 'La IA no devolvió respuesta.' }, { status: 502 })
    return NextResponse.json({ answer })
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'La IA tardó demasiado en responder.' : 'No se pudo conectar con la IA (¿Ollama está corriendo?).'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
