/**
 * Descargar una tarea como PDF, sin librerías nuevas: se abre una ventana con
 * una hoja limpia y bien maquetada y se dispara la impresión del navegador, que
 * en su diálogo ofrece "Guardar como PDF". Así el estudiante se lleva el
 * enunciado en un archivo, no solo como texto en pantalla.
 */
import type { MyTask } from '@/backend/services/classTasks'

const PARCIAL: Record<string, string> = {
  p1: 'I Parcial', p2: 'II Parcial', p3: 'III Parcial', final: 'Final',
}

const DELIV: Record<string, string> = {
  files: 'Archivos', screenshot: 'Capturas o video', github: 'Enlace de GitHub',
  commits: 'Commits mínimos', per_requirement: 'Evidencia por requisito', text: 'Texto o reflexión',
}

/** Escapa el texto del usuario para que no rompa el HTML de la hoja. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

export function downloadTask(t: MyTask): void {
  const due = t.dueDate
    ? new Date(t.dueDate).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha límite'
  const parcial = t.parcial && PARCIAL[t.parcial] ? PARCIAL[t.parcial] : ''
  const entregables = (t.deliverables ?? [])
    .map((d) => DELIV[d.kind] ?? d.kind)
    .map((x) => `<li>${esc(x)}</li>`)
    .join('')

  // Respeta los saltos de línea del enunciado
  const cuerpo = esc(t.description || 'Sin enunciado.').replace(/\n/g, '<br>')

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(t.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1d24; margin: 0; padding: 48px 56px; line-height: 1.6; }
  .top { border-bottom: 3px solid #1089d3; padding-bottom: 18px; margin-bottom: 26px; }
  .cls { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #1089d3; font-weight: 700; }
  h1 { font-size: 26px; margin: 8px 0 0; }
  .meta { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-top: 14px; font-size: 13px; color: #4a5160; }
  .meta b { color: #1a1d24; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #6a7180; margin: 28px 0 10px; }
  .body { font-size: 14.5px; white-space: normal; }
  ul { margin: 6px 0 0; padding-left: 20px; }
  li { margin: 3px 0; }
  .foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid #dfe3ea; font-size: 11px; color: #9099a8; }
  @media print { body { padding: 24px 30px; } }
</style></head><body>
  <div class="top">
    <div class="cls">${esc(t.className)}${parcial ? ' · ' + esc(parcial) : ''}</div>
    <h1>${esc(t.title)}</h1>
    <div class="meta">
      <span><b>Fecha límite:</b> ${esc(due)}</span>
      ${t.points ? `<span><b>Puntos:</b> ${t.points}</span>` : ''}
      ${t.group ? '<span><b>Entrega:</b> grupal</span>' : ''}
    </div>
  </div>
  <h2>Enunciado</h2>
  <div class="body">${cuerpo}</div>
  ${entregables ? `<h2>Qué debes entregar</h2><ul>${entregables}</ul>` : ''}
  <div class="foot">NexusForge OS · Generado el ${new Date().toLocaleDateString('es')}</div>
  <script>window.onload = function () { window.print(); }</script>
</body></html>`

  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) {
    alert('Permite las ventanas emergentes para descargar la tarea.')
    return
  }
  w.document.write(html)
  w.document.close()
}
