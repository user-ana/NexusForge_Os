'use client'

/** Utilidades del asistente inmersivo: leer archivos y catálogo de idiomas. */

/** Idiomas para el modo traducir / conversación en vivo (código BCP-47 + nombre). */
export const LANGUAGES: { code: string; label: string; name: string }[] = [
  { code: 'es-ES', label: 'Español', name: 'español' },
  { code: 'en-US', label: 'English', name: 'inglés' },
  { code: 'pt-BR', label: 'Português', name: 'portugués' },
  { code: 'fr-FR', label: 'Français', name: 'francés' },
  { code: 'de-DE', label: 'Deutsch', name: 'alemán' },
  { code: 'it-IT', label: 'Italiano', name: 'italiano' },
  { code: 'zh-CN', label: '中文', name: 'chino' },
  { code: 'ja-JP', label: '日本語', name: 'japonés' },
]

export function langName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code
}

/**
 * Extrae el texto de un PDF EN EL NAVEGADOR con pdfjs (igual que el lector de
 * módulos). Se hace aquí, no en el servidor, porque parsear PDFs en serverless
 * es frágil; a la IA solo le llega el texto ya extraído.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  let text = ''
  const max = Math.min(doc.numPages, 30) // tope: leer un PDF enorme entero es lento y no cabe en el prompt
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it) => (it as { str?: string }).str ?? '').join(' ') + '\n'
    if (text.length > 20000) break
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** Lee cualquier archivo de texto plano (.txt, .md, .csv). */
export async function readTextFile(file: File): Promise<string> {
  return (await file.text()).slice(0, 20000)
}

/** Convierte una imagen a base64 SIN el prefijo data: (lo que espera la IA con visión). */
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

/** Quita el markdown para mostrar/leer texto limpio (negritas, viñetas, enlaces…). */
export function toPlain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .trim()
}
