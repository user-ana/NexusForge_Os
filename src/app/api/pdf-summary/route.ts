import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Lee un PDF (enunciado de tarea) y devuelve un RESUMEN.
 *
 * Flujo: el navegador ya subió el PDF a Storage y nos manda su URL. Aquí:
 *   1) Descargamos el PDF y extraemos su texto.
 *   2) Se lo pasamos a la IA (Ollama/Llama) para que redacte un resumen breve.
 *   3) Si la IA no responde a tiempo (túnel), devolvemos el texto recortado.
 *      Así el campo Descripción SIEMPRE se llena: la demo nunca queda en blanco.
 *
 * Seguridad: exige sesión iniciada y limita el uso (extraer + IA es costoso).
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_PDF_BYTES = 12 * 1024 * 1024 // 12 MB
const MAX_TEXT = 8000 // caracteres que le pasamos a la IA (rápido en CPU)

export async function POST(req: Request) {
  sweepBuckets()

  const ip = clientIp(req)
  const byIp = rateLimit(`pdf:ip:${ip}`, 15, 60 * 1000)
  if (!byIp.ok) {
    return NextResponse.json({ error: `Vas muy rápido. Espera ${byIp.retryAfter} s.` }, { status: 429 })
  }
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const byUser = rateLimit(`pdf:user:${user.id}`, 10, 60 * 1000)
  if (!byUser.ok) {
    return NextResponse.json({ error: `Vas muy rápido. Espera ${byUser.retryAfter} s.` }, { status: 429 })
  }

  let body: { pdfUrl?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }
  const pdfUrl = (body.pdfUrl ?? '').trim()
  if (!/^https?:\/\//.test(pdfUrl)) {
    return NextResponse.json({ error: 'URL de PDF inválida.' }, { status: 400 })
  }

  // 1) Descargar el PDF
  let bytes: Uint8Array
  try {
    const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return NextResponse.json({ error: 'No se pudo descargar el PDF.' }, { status: 400 })
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'El PDF es demasiado grande (máx. 12 MB).' }, { status: 413 })
    }
    bytes = new Uint8Array(buf)
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el PDF.' }, { status: 400 })
  }

  // 2) Extraer el texto
  let text = ''
  try {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: bytes })
    const result = await parser.getText()
    text = (result.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  } catch (e) {
    console.error('pdf-summary extract', e)
    return NextResponse.json({ error: 'No se pudo extraer el texto del PDF.' }, { status: 422 })
  }
  if (!text) {
    return NextResponse.json({ error: 'El PDF no tiene texto (¿es una imagen escaneada?).' }, { status: 422 })
  }

  const clipped = text.slice(0, MAX_TEXT)
  // Respaldo por si la IA falla: un extracto legible del propio PDF
  const fallback = text.slice(0, 700).trim() + (text.length > 700 ? '…' : '')

  // 3) Resumir con la IA (con red de seguridad)
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

  // La IA no respondió: devolvemos el extracto para no dejar la demo en blanco
  return NextResponse.json({ summary: fallback, source: 'extract' })
}
