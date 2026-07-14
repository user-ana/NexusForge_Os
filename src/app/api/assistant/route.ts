import { NextResponse } from 'next/server'

/**
 * Asistente con IA (Fase 3a — solo lectura). Recibe la pregunta del catedrático
 * + un resumen de sus clases (contexto), y se lo pasa a Llama vía Ollama para que
 * responda en lenguaje natural, SIN inventar (RAG). El LLM corre en el servidor
 * Ollama definido por OLLAMA_BASE_URL (local: http://localhost:11434).
 */
export const runtime = 'nodejs'

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

  const system = [
    'Eres el asistente del catedrático dentro de NexusForge OS (plataforma académica).',
    'Consultas responden SOLO con base en los DATOS que te doy abajo sobre sus clases. No inventes.',
    'Además PUEDES CREAR clases, grupos y proyectos, y ELIMINAR una clase, usando las herramientas cuando el catedrático lo pida.',
    'Usa eliminar_clase SOLO cuando el catedrático diga explícitamente eliminar/borrar/dar de baja una clase.',
    'REGLA CRÍTICA: NUNCA inventes datos. Solo usa lo que el catedrático escribió textualmente.',
    'Si NO dio un dato requerido (ej. el nombre de la clase, la cantidad de grupos, la clase destino), NO llames la herramienta: responde con una pregunta corta pidiendo ese dato exacto.',
    'Antes de crear algo, si en los DATOS ya existe algo con ese nombre, avísalo en vez de duplicar.',
    'Sé conciso, útil y responde SIEMPRE en español. Al listar, usa viñetas.',
    '',
    'DATOS ACTUALES DE SUS CLASES:',
    context || '(sin datos)',
  ].join('\n')

  const tools = [
    {
      type: 'function',
      function: {
        name: 'crear_clase',
        description: 'Crea una nueva clase o curso para el catedrático',
        parameters: {
          type: 'object',
          properties: {
            nombre: { type: 'string', description: 'Nombre de la clase, ej. Bases de Datos' },
            seccion: { type: 'string', description: 'Sección (opcional)' },
            periodo: { type: 'string', description: 'Período o ciclo, ej. 2026-II (opcional)' },
          },
          required: ['nombre'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'crear_grupos',
        description: 'Crea varias salas/grupos vacíos dentro de una clase existente',
        parameters: {
          type: 'object',
          properties: {
            clase: { type: 'string', description: 'Nombre de la clase donde crear los grupos' },
            cantidad: { type: 'integer', description: 'Cuántos grupos crear' },
          },
          required: ['clase', 'cantidad'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'crear_proyecto',
        description: 'Crea un proyecto o tarea (enunciado) en una clase existente',
        parameters: {
          type: 'object',
          properties: {
            clase: { type: 'string', description: 'Nombre de la clase' },
            titulo: { type: 'string', description: 'Título del proyecto o tarea' },
            descripcion: { type: 'string', description: 'Descripción del enunciado (opcional)' },
            parcial: { type: 'string', description: 'Parcial: p1, p2, p3 o final (opcional)' },
          },
          required: ['clase', 'titulo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'eliminar_clase',
        description: 'Elimina (da de baja) una clase existente y todo su contenido. Solo si el catedrático lo pide.',
        parameters: {
          type: 'object',
          properties: {
            clase: { type: 'string', description: 'Nombre de la clase a eliminar' },
          },
          required: ['clase'],
        },
      },
    },
  ]

  try {
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: '30m', // mantiene el modelo cargado en memoria (evita el arranque en frío)
        options: { temperature: 0.2, num_predict: 400 }, // factual + respuesta acotada = más rápido
        tools,
        messages: [
          { role: 'system', content: system },
          ...history,
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
