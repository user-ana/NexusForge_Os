import { NextResponse } from 'next/server'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Asistente con IA (Fase 3a — solo lectura). Recibe la pregunta del catedrático
 * + un resumen de sus clases (contexto), y se lo pasa a Llama vía Ollama para que
 * responda en lenguaje natural, SIN inventar (RAG). El LLM corre en el servidor
 * Ollama definido por OLLAMA_BASE_URL (local: http://localhost:11434).
 *
 * Seguridad: exige sesión iniciada y limita el número de preguntas. Sin esto
 * cualquiera podía consumir mi servidor de IA gratis (abuso de recursos) o
 * dejarlo saturado para el resto (denegación de servicio por agotamiento).
 */
export const runtime = 'nodejs'
// La IA puede correr en CPU (lenta). Damos margen para que Vercel no corte antes.
export const maxDuration = 300

// Tope de tamaño: una pregunta enorme obligaría al modelo a trabajar de más.
const MAX_QUESTION = 2000
const MAX_CONTEXT = 20000

export async function POST(req: Request) {
  sweepBuckets()

  // 1) Límite por IP (antes de tocar nada más)
  const ip = clientIp(req)
  const byIp = rateLimit(`assistant:ip:${ip}`, 30, 60 * 1000) // 30 por minuto
  if (!byIp.ok) {
    return NextResponse.json(
      { error: `Vas muy rápido. Espera ${byIp.retryAfter} segundos.` },
      { status: 429 },
    )
  }

  // 2) Solo usuarios con sesión: la IA no es un servicio público
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  // 3) Límite por usuario (una persona no puede acaparar el servidor de IA)
  const byUser = rateLimit(`assistant:user:${user.id}`, 20, 60 * 1000) // 20 por minuto
  if (!byUser.ok) {
    return NextResponse.json(
      { error: `Vas muy rápido. Espera ${byUser.retryAfter} segundos.` },
      { status: 429 },
    )
  }

  let body: { question?: string; context?: string; history?: { role: string; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const question = (body.question ?? '').trim().slice(0, MAX_QUESTION)
  const context = (body.context ?? '').trim().slice(0, MAX_CONTEXT)
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
  const ACTION_RE = /\b(?:crea|cree|crear|cre[aá]|agrega|agregar|a[ñn]ade|a[ñn]adir|arma|armar|genera|generar|registra|registrar|asigna|asignar|asign[aá]|elimina|eliminar|borra|borrar|quita|quitar|remueve|remover|haz)(?:me|nos|le|les|lo|la|los|las)?\b|\bnuev[oa]s?\b|\bd(?:a|ar|ale|arle|ame)\s+de\s+baja\b/i
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
    { type: 'function', function: { name: 'asignar_proyecto', description: 'Asignar un proyecto existente a un grupo de una clase', parameters: { type: 'object', properties: { clase: { type: 'string' }, grupo: { type: 'string' }, proyecto: { type: 'string' } }, required: ['clase', 'grupo', 'proyecto'] } } },
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
