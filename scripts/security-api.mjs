/**
 * PRUEBA DE LOS ENDPOINTS (fuerza bruta y permisos)
 *
 * Se corre con:   npm run security:api
 * Contra otro sitio:   npm run security:api -- http://localhost:3000
 *
 * Comprueba que:
 *   - El endpoint que robaba cuentas ya no existe.
 *   - Ningun endpoint responde sin sesion iniciada.
 *   - El limite de intentos corta un ataque de fuerza bruta.
 *
 * No necesita llaves ni .env: solo golpea el sitio desde fuera, igual que lo
 * haria un atacante.
 */

const base = (process.argv[2] || 'https://nexusforgeos.vercel.app').replace(/\/$/, '')

let fallos = 0
function check(nombre, ok, detalle = '') {
  if (!ok) fallos++
  const etiqueta = ok ? '\x1b[32m[OK]     \x1b[0m' : '\x1b[31m[REVISAR]\x1b[0m'
  console.log(`${etiqueta} ${nombre}${detalle ? `  -> ${detalle}` : ''}`)
}

async function post(path, body = {}) {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.status
  } catch (e) {
    return `sin respuesta (${e.message})`
  }
}

console.log('\n=============================================')
console.log('  PRUEBA DE ENDPOINTS')
console.log(`  ${base}`)
console.log('=============================================\n')

/* ---------- 1. Cabeceras de seguridad ---------- */
try {
  const res = await fetch(base, { method: 'HEAD' })
  const esperadas = [
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'strict-transport-security',
  ]
  const faltan = esperadas.filter((h) => !res.headers.get(h))
  check('Cabeceras de seguridad HTTP', faltan.length === 0, faltan.length ? `faltan: ${faltan.join(', ')}` : 'las 5 presentes')
} catch (e) {
  check('Cabeceras de seguridad HTTP', false, e.message)
}

/* ---------- 2. El endpoint peligroso ya no existe ---------- */
const reset = await post('/api/reset-password', { email: 'alguien@uth.hn', password: 'NuevaClave123' })
check('/api/reset-password eliminado (robo de cuenta)', reset === 404, `respondio ${reset}`)

/* ---------- 3. Nada responde sin sesion ---------- */
for (const ruta of ['/api/delete-account', '/api/verify-teacher-key', '/api/assistant']) {
  const code = await post(ruta, { question: 'hola', key: 'X' })
  check(`${ruta} exige sesion iniciada`, code === 401, `respondio ${code}`)
}

/* ---------- 4. Ataque de fuerza bruta a la clave de docente ---------- */
console.log('\nSimulando fuerza bruta contra la clave de docente...')
const codigos = []
for (let i = 1; i <= 8; i++) {
  codigos.push(await post('/api/verify-teacher-key', { key: `INTENTO-${i}` }))
}
const bloqueado = codigos.indexOf(429)
console.log(`  respuestas: ${codigos.join(', ')}`)
check(
  'El limite de intentos corta la fuerza bruta',
  bloqueado !== -1,
  bloqueado !== -1 ? `bloqueado a partir del intento ${bloqueado + 1}` : 'nunca bloqueo',
)

console.log(
  fallos === 0
    ? '\n\x1b[32mRESULTADO: todos los endpoints protegidos.\x1b[0m\n'
    : `\n\x1b[31mRESULTADO: ${fallos} prueba(s) para revisar.\x1b[0m\n`,
)
process.exit(fallos === 0 ? 0 : 1)
