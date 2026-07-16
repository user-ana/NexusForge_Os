import { NextResponse } from 'next/server'

/**
 * Asistente con IA (Fase 3a — solo lectura). Recibe la pregunta del catedrático
 * + un resumen de sus clases (contexto), y se lo pasa a Llama vía Ollama para que
 * responda en lenguaje natural, SIN inventar (RAG). El LLM corre en el servidor
 * Ollama definido por OLLAMA_BASE_URL (local: http://localhost:11434).
 */
export const runtime = 'nodejs'
// La IA puede correr en CPU (lenta). Damos margen para que Vercel no corte antes.
export const maxDuration = 300

export async function POST(req: Request) {
  let body: { question?: string; context?: string; history?: { role: string; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const question = (body.question ?? '').trim()
  const context = (body.context ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })

  // Historial de la conversación (memoria), últimos mensajes
  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
    : []

  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  // llama3.2 (3B) cabe en GPUs de ~6GB (RTX 4050) -> respuestas rápidas.
  const model = process.env.OLLAMA_MODEL || 'llama3.2'

  // ¿El mensaje pide de verdad una ACCIÓN (crear/eliminar)? Solo entonces le
  // ofrecemos las herramientas al modelo. Así un saludo o una consulta no se
  // convierte por error en "crear una clase" (el modelo pequeño se sesga con
  // las herramientas presentes). Determinista y además más rápido (prompt corto).
  const ACTION_RE = /\b(?:crea|cree|crear|cre[aá]|agrega|agregar|a[ñn]ade|a[ñn]adir|arma|armar|genera|generar|registra|registrar|elimina|eliminar|borra|borrar|quita|quitar|remueve|remover|haz)(?:me|nos|le|les|lo|la|los|las)?\b|\bnuev[oa]s?\b|\bd(?:a|ar|ale|arle|ame)\s+de\s+baja\b/i
  const wantsAction = ACTION_RE.test(question)

  // En modo ACCIÓN el prompt es corto (sin el contexto RAG) para responder
  // rápido en CPU; el cliente valida duplicados y pide confirmación. En modo
  // CONSULTA sí va el contexto completo para responder con datos ciertos.
  const system = wantsAction
    ? [
        'Eres el asistente del catedrático en NexusForge OS.',
        'Usa una herramienta SOLO para lo que el catedrático pida (crear/eliminar).',
        'Usa eliminar_clase SOLO si dice explícitamente eliminar/borrar/dar de baja una clase.',
        'NUNCA inventes datos: usa solo lo que escribió textualmente.',
        'Si falta un dato requerido (nombre, cantidad o clase destino), NO llames la herramienta: pídelo en una frase corta.',
        'Responde en español.',
      ].join('\n')
    : [
        'Eres el asistente del catedrático dentro de NexusForge OS (plataforma académica).',
        'Responde SOLO con base en los DATOS de abajo sobre sus clases. NUNCA inventes; si algo no está, dilo.',
        'Sé conciso, útil y responde SIEMPRE en español. Al listar, usa viñetas.',
        '',
        'DATOS ACTUALES DE SUS CLASES:',
        context || '(sin datos)',
      ].join('\n')

  // Esquemas compactos (sin descripciones largas) = menos tokens = respuesta
  // más rápida en CPU, para caber en el límite de 100s del túnel gratis.
  const tools = [
    { type: 'function', function: { name: 'crear_clase', description: 'Crear una clase', parameters: { type: 'object', properties: { nombre: { type: 'string' }, seccion: { type: 'string' }, periodo: { type: 'string' } }, required: ['nombre'] } } },
    { type: 'function', function: { name: 'crear_grupos', description: 'Crear grupos en una clase', parameters: { type: 'object', properties: { clase: { type: 'string' }, cantidad: { type: 'integer' } }, required: ['clase', 'cantidad'] } } },
    { type: 'function', function: { name: 'crear_proyecto', description: 'Crear un proyecto en una clase', parameters: { type: 'object', properties: { clase: { type: 'string' }, titulo: { type: 'string' }, descripcion: { type: 'string' }, parcial: { type: 'string' } }, required: ['clase', 'titulo'] } } },
    { type: 'function', function: { name: 'eliminar_clase', description: 'Eliminar una clase', parameters: { type: 'object', properties: { clase: { type: 'string' } }, required: ['clase'] } } },
  ]

  try {
    const payload: Record<string, unknown> = {
      model,
      stream: false,
      keep_alive: '30m', // mantiene el modelo cargado en memoria (evita el arranque en frío)
      // Tope de tokens acotado: en CPU cada token es lento y el túnel gratis
      // corta a los 100s. Acciones necesitan poco; consultas un poco más.
      options: { temperature: 0.2, num_predict: wantsAction ? 100 : 200 },
      messages: [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: question },
      ],
    }
    // Solo ofrecemos herramientas si el mensaje pide una acción (crear/eliminar).
    if (wantsAction) payload.tools = tools

    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // el modelo puede tardar bastante en CPU (VM). Margen amplio.
      signal: AbortSignal.timeout(280_000),
    })
    if (!r.ok) {
      return NextResponse.json({ error: `El servidor de IA respondió ${r.status}.` }, { status: 502 })
    }
    const data = await r.json()
    const msg = data?.message

    // ¿La IA quiere ejecutar una acción? La devolvemos al cliente para CONFIRMAR (no se ejecuta aquí).
    const call = msg?.tool_calls?.[0]?.function
    if (call?.name) {
      const args = typeof call.arguments === 'string' ? safeParse(call.arguments) : call.arguments ?? {}
      return NextResponse.json({ toolCall: { name: call.name, args } })
    }

    const answer = msg?.content?.trim() ?? ''
    if (!answer) return NextResponse.json({ error: 'La IA no devolvió respuesta.' }, { status: 502 })
    return NextResponse.json({ answer })
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'La IA tardó demasiado en responder.' : 'No se pudo conectar con la IA (¿Ollama está corriendo?).'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
