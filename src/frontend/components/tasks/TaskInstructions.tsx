'use client'

/**
 * Renderiza el enunciado de una tarea como un documento ESTRUCTURADO en vez de
 * un muro de texto: detecta el título, los encabezados de sección ("Objetivo:",
 * "Qué deben entregar:"), las listas numeradas y las viñetas, y les da color y
 * separadores. Así el estudiante lee sin perderse.
 *
 * No interpreta markdown ni HTML del usuario: solo reconoce patrones de texto
 * plano y arma bloques. El contenido se muestra tal cual (seguro por defecto).
 */

type Block =
  | { t: 'title'; text: string }
  | { t: 'head'; label: string; body?: string; tone: number }
  | { t: 'ol'; items: string[] }
  | { t: 'ul'; items: string[] }
  | { t: 'p'; text: string }

/** Colores que van rotando por cada encabezado de sección. */
const TONES = ['cyan', 'gold', 'green', 'blue', 'violet']

function parse(src: string): Block[] {
  const lines = src.split(/\r?\n/)
  const blocks: Block[] = []
  let headTone = 0
  let first = true
  let ol: string[] = []
  let ul: string[] = []

  const flush = () => {
    if (ol.length) { blocks.push({ t: 'ol', items: ol }); ol = [] }
    if (ul.length) { blocks.push({ t: 'ul', items: ul }); ul = [] }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flush(); continue }

    const num = line.match(/^(\d+)[.)]\s+(.*)$/)
    const bul = line.match(/^[•\-*]\s+(.*)$/)
    const head = line.match(/^([A-Za-zÁÉÍÓÚÑñáéíóú][^:]{1,58}):\s*(.*)$/)

    // La primera línea de contenido suele ser el título de la tarea
    if (first && !num && !bul) {
      first = false
      if (/^(tarea|actividad|proyecto|lab|práctica|practica)\b/i.test(line) || line.length <= 62) {
        flush()
        blocks.push({ t: 'title', text: line.replace(/:$/, '') })
        continue
      }
    }
    first = false

    if (num) { if (ul.length) flush(); ol.push(num[2]); continue }
    if (bul) { if (ol.length) flush(); ul.push(bul[1]); continue }

    flush()
    // Encabezado de sección: una etiqueta corta seguida de ":"
    if (head && head[1].split(/\s+/).length <= 6) {
      blocks.push({ t: 'head', label: head[1], body: head[2] || undefined, tone: headTone++ })
      continue
    }
    blocks.push({ t: 'p', text: line })
  }
  flush()
  return blocks
}

export default function TaskInstructions({ text }: { text: string }) {
  const blocks = parse(text)
  return (
    <div className="neo-ins">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'title':
            return <h4 key={i} className="neo-ins-title">{b.text}</h4>
          case 'head':
            return (
              <div key={i} className={`neo-ins-head neo-ins-head--${TONES[b.tone % TONES.length]}`}>
                <span className="neo-ins-bar" />
                <div>
                  <span className="neo-ins-label">{b.label}</span>
                  {b.body && <p className="neo-ins-body">{b.body}</p>}
                </div>
              </div>
            )
          case 'ol':
            return (
              <ol key={i} className="neo-ins-ol">
                {b.items.map((it, j) => (
                  <li key={j}><span className="neo-ins-num">{j + 1}</span><span>{it}</span></li>
                ))}
              </ol>
            )
          case 'ul':
            return (
              <ul key={i} className="neo-ins-ul">
                {b.items.map((it, j) => (
                  <li key={j}><span className="neo-ins-dot" /><span>{it}</span></li>
                ))}
              </ul>
            )
          default:
            return <p key={i} className="neo-ins-p">{b.text}</p>
        }
      })}
    </div>
  )
}
