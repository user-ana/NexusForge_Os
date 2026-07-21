// Medicion temporal de la IA. Se borra al terminar.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const base = 'https://nexusforgeos.vercel.app'
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = `aiwarm.borrar.${Date.now()}@example.com`
const password = 'Prueba-Segura-2026!'
let uid = null

const CONTEXTO = `CLASE: Ingenieria de Software II (2026, III parcial)
Estudiantes: 12. Grupos: 3 (Alfa, Beta, Gamma).
Proyectos: Sistema de inventario, App de biblioteca, Portal de notas.`

const PREGUNTAS = [
  { etiqueta: 'calentamiento (corta)', q: 'Responde solo con: LISTO' },
  { etiqueta: 'consulta simple', q: 'Cuantos grupos tengo?' },
  { etiqueta: 'consulta con datos', q: 'Listame los proyectos de mi clase' },
  { etiqueta: 'accion (crear)', q: 'Crea una clase llamada Redes' },
]

try {
  const { data: c, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (ce) throw ce
  uid = c.user.id
  const user = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: s } = await user.auth.signInWithPassword({ email, password })
  const token = s.session.access_token

  const tiempos = []
  for (const p of PREGUNTAS) {
    const t0 = Date.now()
    let estado, cuerpo
    try {
      const res = await fetch(`${base}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: p.q, context: CONTEXTO }),
        signal: AbortSignal.timeout(200000),
      })
      estado = res.status
      cuerpo = (await res.text()).slice(0, 130).replace(/\s+/g, ' ')
    } catch (e) {
      estado = 'timeout'
      cuerpo = e.message
    }
    const secs = (Date.now() - t0) / 1000
    tiempos.push(secs)
    console.log(`${String(secs.toFixed(1)).padStart(6)}s  [${estado}]  ${p.etiqueta}`)
    console.log(`         ${cuerpo}\n`)
  }

  const calientes = tiempos.slice(1)
  const prom = calientes.reduce((a, b) => a + b, 0) / calientes.length
  console.log('-----------------------------------------')
  console.log(`Primera (frio):      ${tiempos[0].toFixed(1)}s`)
  console.log(`Promedio ya caliente: ${prom.toFixed(1)}s`)
  console.log(`Peor caso caliente:   ${Math.max(...calientes).toFixed(1)}s`)
  console.log(`Limite del tunel:     100s`)
} catch (e) {
  console.log('ERROR:', e.message)
} finally {
  if (uid) await admin.auth.admin.deleteUser(uid)
  console.log('\n(usuario de prueba eliminado)')
}
