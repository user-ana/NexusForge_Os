/**
 * Candado para publicar Ollama por un túnel.
 * =========================================
 *
 * POR QUÉ EXISTE
 *
 * Ollama no tiene autenticación de ninguna clase. Mientras vive en `localhost`
 * o en la red de casa eso da igual. En el momento en que se publica por un
 * túnel para que otras personas prueben la plataforma, deja de darlo:
 *
 *   - Cualquiera que encuentre la URL puede usar la GPU para lo que quiera.
 *   - Y no solo generar: la API de Ollama incluye `/api/delete` (borrar
 *     modelos) y `/api/pull` (descargar gigabytes al disco ajeno).
 *
 * Los endpoints de Ollama expuestos se escanean activamente en Internet. Una
 * URL "difícil de adivinar" no es una defensa.
 *
 * QUÉ HACE ESTE PROXY
 *
 *   1. Exige `Authorization: Bearer <NEXUS_PROXY_TOKEN>` en cada petición.
 *   2. Solo deja pasar las rutas de LECTURA y GENERACIÓN. Todo lo que
 *      modifique el estado del servidor de modelos queda fuera.
 *   3. Reenvía a Ollama en streaming, sin acumular la respuesta en memoria.
 *
 * USO
 *
 *   set NEXUS_PROXY_TOKEN=<token largo>     (Windows CMD)
 *   $env:NEXUS_PROXY_TOKEN="<token largo>"  (PowerShell)
 *   node scripts/ollama-proxy.mjs
 *
 *   ngrok http 11435
 *
 * Y en Vercel:
 *   OLLAMA_BASE_URL   = https://<lo-que-de-ngrok>
 *   OLLAMA_AUTH_TOKEN = <el mismo token>
 */
import http from 'node:http'

const PORT = Number(process.env.NEXUS_PROXY_PORT || 11435)
const TARGET = process.env.NEXUS_PROXY_TARGET || 'http://127.0.0.1:11434'
const TOKEN = process.env.NEXUS_PROXY_TOKEN || ''

/**
 * Lista blanca, no lista negra. Con una lista negra, cada versión nueva de
 * Ollama que añada un endpoint lo dejaría abierto por omisión.
 */
const ALLOWED = new Set([
  '/api/chat',      // conversación (lo que usa el asistente)
  '/api/generate',  // generación simple
  '/api/tags',      // qué modelos hay (lo consulta /api/health)
  '/api/show',      // ficha de un modelo
  '/api/ps',        // qué está cargado
  '/api/embeddings',
  '/api/embed',
])

if (!TOKEN || TOKEN.length < 24) {
  console.error('ERROR: define NEXUS_PROXY_TOKEN con al menos 24 caracteres.')
  console.error('       Un token corto se adivina por fuerza bruta; publicar esto sin token no tiene sentido.')
  process.exit(1)
}

/** Comparación en tiempo constante: no filtrar el token por el tiempo de respuesta. */
function tokenOk(header) {
  const dado = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (dado.length !== TOKEN.length) return false
  let dif = 0
  for (let i = 0; i < TOKEN.length; i++) dif |= dado.charCodeAt(i) ^ TOKEN.charCodeAt(i)
  return dif === 0
}

function niega(res, code, motivo) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: motivo }))
}

const server = http.createServer((req, res) => {
  const ruta = (req.url || '').split('?')[0]
  const desde = req.headers['x-forwarded-for'] || req.socket.remoteAddress

  if (!tokenOk(req.headers.authorization)) {
    console.warn(`[${new Date().toISOString()}] RECHAZADO sin token · ${ruta} · ${desde}`)
    return niega(res, 401, 'No autorizado.')
  }
  if (!ALLOWED.has(ruta)) {
    console.warn(`[${new Date().toISOString()}] RECHAZADO ruta no permitida · ${ruta} · ${desde}`)
    return niega(res, 403, 'Ruta no permitida.')
  }

  const destino = new URL(ruta, TARGET)
  // El token es para ESTE proxy, no para Ollama: se quita antes de reenviar.
  // Hay que BORRAR la clave, no ponerla en undefined — Node rechaza una
  // cabecera con valor undefined con ERR_HTTP_INVALID_HEADER_VALUE.
  const headers = { ...req.headers, host: destino.host }
  delete headers.authorization

  const upstream = http.request(
    destino,
    { method: req.method, headers },
    (r) => {
      res.writeHead(r.statusCode || 502, r.headers)
      r.pipe(res) // streaming: el asistente pinta la respuesta mientras llega
    },
  )
  upstream.on('error', (e) => {
    console.error('fallo al hablar con Ollama:', e.message)
    if (!res.headersSent) niega(res, 502, 'El servidor de IA no responde.')
  })
  req.pipe(upstream)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy de Ollama escuchando en http://0.0.0.0:${PORT}`)
  console.log(`  reenvía a : ${TARGET}`)
  console.log(`  rutas     : ${[...ALLOWED].join(', ')}`)
  console.log(`  token     : ${TOKEN.length} caracteres`)
  console.log('\nAhora publica este puerto:  ngrok http ' + PORT)
})
