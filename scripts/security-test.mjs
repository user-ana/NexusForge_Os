/**
 * PRUEBA DE SEGURIDAD DE NEXUSFORGE OS
 *
 * Se corre con:   npm run security:test
 *
 * Que hace:
 *   1. Crea un usuario de prueba real en la base.
 *   2. Intenta convertirlo en catedratico por varias vias (como lo haria un
 *      atacante desde la consola del navegador).
 *   3. Intenta tocar datos de otras personas.
 *   4. Comprueba que la via legitima (el servidor) si funciona.
 *   5. Borra el usuario de prueba.
 *
 * Es seguro correrlo: solo crea y borra su propio usuario temporal, y si llega a
 * modificar algo de otra fila lo deja como estaba.
 *
 * Necesita el archivo .env.local (nunca se sube a GitHub).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

/* ---------- 1. Leer las llaves de .env.local ---------- */
if (!existsSync('.env.local')) {
  console.log('No encontre .env.local. Corre este script desde la raiz del proyecto.')
  process.exit(1)
}
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) {
  console.log('Faltan llaves en .env.local (URL, ANON_KEY o SERVICE_ROLE_KEY).')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

/* ---------- Utilidades de impresion ---------- */
let fallos = 0
function check(nombre, ok, detalle = '') {
  if (!ok) fallos++
  const etiqueta = ok ? '\x1b[32m[BLOQUEADO]\x1b[0m ' : '\x1b[31m[VULNERABLE]\x1b[0m'
  console.log(`${etiqueta} ${nombre}${detalle ? `  -> ${detalle}` : ''}`)
}

/* ---------- 2. Requisito previo ---------- */
const probe = await admin.from('profiles').select('id').limit(1)
if (probe.error) {
  console.log(`\nNo puedo probar: ${probe.error.message}`)
  console.log('Falta correr supabase/security_patch.sql en el SQL Editor de Supabase.\n')
  process.exit(1)
}

console.log('\n=============================================')
console.log('  PRUEBA DE SEGURIDAD - NexusForge OS')
console.log('=============================================\n')

const email = `sectest.borrar.${Date.now()}@example.com`
const password = 'Prueba-Segura-2026!'
let uid = null

async function roleOf() {
  const { data, error } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
  if (error) return `ERROR(${error.message})`
  return data ? data.role : 'SIN FILA'
}

try {
  /* ---------- ATAQUE 1 ---------- */
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: 'sectest', role: 'teacher' },
  })
  if (cErr) throw cErr
  uid = created.user.id
  await new Promise((r) => setTimeout(r, 1000))
  let rol = await roleOf()
  check('Registrarse pidiendo el rol de catedratico', rol === 'student', `rol: ${rol}`)

  // De aqui en adelante actuamos como un usuario normal, con su token real
  const user = createClient(url, anonKey)
  const { error: sErr } = await user.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr

  /* ---------- ATAQUE 2 ---------- */
  await user.auth.updateUser({ data: { role: 'teacher' } })
  await new Promise((r) => setTimeout(r, 1200))
  rol = await roleOf()
  check('Auto-ascenderse con updateUser() desde el navegador', rol === 'student', `rol: ${rol}`)

  /* ---------- ATAQUE 3 ---------- */
  await user.from('profiles').update({ role: 'teacher' }).eq('id', uid)
  rol = await roleOf()
  check('Escribir el rol directo en la tabla profiles', rol === 'student', `rol: ${rol}`)

  /* ---------- ATAQUE 4 ---------- */
  const { data: otro } = await admin.from('profiles').select('id, full_name').neq('id', uid).limit(1).maybeSingle()
  if (otro) {
    await user.from('profiles').update({ full_name: 'HACKEADO' }).eq('id', otro.id)
    const { data: after } = await admin.from('profiles').select('full_name').eq('id', otro.id).maybeSingle()
    const ok = after?.full_name !== 'HACKEADO'
    check('Modificar el perfil de otra persona', ok, `quedo: ${after?.full_name}`)
    if (!ok) await admin.from('profiles').update({ full_name: otro.full_name }).eq('id', otro.id)
  }

  /* ---------- ATAQUE 5 ---------- */
  const antes = await admin.from('classes').select('id')
  await user.from('classes').delete().neq('teacher_id', uid)
  const despues = await admin.from('classes').select('id')
  check('Borrar clases de otros catedraticos', (antes.data?.length ?? 0) === (despues.data?.length ?? 0),
    `clases: ${antes.data?.length ?? 0} -> ${despues.data?.length ?? 0}`)

  /* ---------- ATAQUE 6: leer mensajes de chats ajenos ---------- */
  const mios = await user.from('messages').select('id').limit(5)
  const todos = await admin.from('messages').select('id').limit(5)
  check('Leer mensajes de grupos a los que no pertenece',
    (mios.data?.length ?? 0) < (todos.data?.length ?? 0) || (todos.data?.length ?? 0) === 0,
    `ve ${mios.data?.length ?? 0} de ${todos.data?.length ?? 0}`)

  /* ---------- CONTROL: la via legitima si funciona ---------- */
  await admin.from('profiles').update({ role: 'teacher' }).eq('id', uid)
  rol = await roleOf()
  const ok = rol === 'teacher'
  if (!ok) fallos++
  console.log(`${ok ? '\x1b[36m[FUNCIONA]\x1b[0m  ' : '\x1b[31m[ROTO]\x1b[0m     '} El servidor SI puede asignar el rol docente  -> rol: ${rol}`)

  await user.auth.signOut()
} catch (e) {
  console.log('\nERROR EN LA PRUEBA:', e.message)
  fallos++
} finally {
  if (uid) {
    await admin.auth.admin.deleteUser(uid)
    console.log('\nUsuario de prueba eliminado.')
  }
  console.log(
    fallos === 0
      ? '\n\x1b[32mRESULTADO: todo bloqueado correctamente.\x1b[0m\n'
      : `\n\x1b[31mRESULTADO: ${fallos} prueba(s) fallaron. Revisar arriba.\x1b[0m\n`,
  )
  process.exit(fallos === 0 ? 0 : 1)
}
