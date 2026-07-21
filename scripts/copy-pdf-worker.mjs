/**
 * Copia el worker de pdfjs-dist a public/ para servirlo como archivo estático.
 *
 * Por qué: el lector de PDF corre en el navegador con un "worker". Empaquetarlo
 * con Next rompe el minificador (usa import.meta), así que lo servimos tal cual
 * desde public/. Este script lo mantiene sincronizado con la versión instalada
 * de pdfjs-dist; se ejecuta solo tras cada npm install (postinstall).
 */
import { copyFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const dest = join(root, 'public', 'pdf.worker.min.mjs')

if (!existsSync(src)) {
  console.warn('[copy-pdf-worker] no se encontró pdfjs-dist; se omite.')
  process.exit(0)
}
copyFileSync(src, dest)
console.log('[copy-pdf-worker] worker de pdfjs copiado a public/pdf.worker.min.mjs')
