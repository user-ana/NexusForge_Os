import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if(m) env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'') }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const email=`aiw2.${Date.now()}@example.com`, password='Prueba-Segura-2026!'
const { data:c } = await admin.auth.admin.createUser({ email, password, email_confirm:true })
const user = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data:s } = await user.auth.signInWithPassword({ email, password })
const prompt = 'Redacta la explicacion de una tarea para estudiantes. Titulo: "Punteros en C". Trata sobre: manejo de memoria dinamica con malloc y free. Incluye que deben hacer, que entregar y un criterio. Maximo 2 parrafos cortos.'
const t0=Date.now()
const res = await fetch('https://nexusforgeos.vercel.app/api/ai-write', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${s.session.access_token}`}, body: JSON.stringify({ prompt }), signal: AbortSignal.timeout(120000) })
console.log(`HTTP ${res.status} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
const j = await res.json().catch(()=>({}))
console.log('source:', j.source, '\ntexto:\n' + (j.text || '(vacio)'))
await admin.auth.admin.deleteUser(c.user.id)
