/**
 * MÓDULOS DE APRENDIZAJE — el material que el catedrático arma por semana o
 * parcial (PDF, presentaciones, enlaces) y publica cuando le toca a la clase.
 *
 *  - El módulo nace OCULTO: solo lo ve su catedrático hasta que lo publica
 *    con publishModule(), que además notifica a cada alumno inscrito.
 *  - De cada PDF se guarda el TEXTO extraído en el navegador. Ese texto es la
 *    base de la sesión de estudio con IA: sin material, la IA no tiene de dónde
 *    explicar. Ver moduleContext().
 */
import { supabase } from '@/backend/supabase'
import { displayName, getSession } from '@/frontend/session/session'

/** Tipo de archivo del módulo (define el icono y si se puede leer su texto). */
export type ModuleFileKind = 'pdf' | 'slides' | 'doc' | 'link' | 'other'

export type ModuleFile = {
  id: string
  moduleId: string
  name: string
  url: string
  kind: ModuleFileKind
  sizeBytes: number
  hasText: boolean // si tiene texto extraído (la IA puede apoyarse en él)
  createdAt: number
}

export type ClassModule = {
  id: string
  classId: string
  title: string
  description: string
  parcial: string
  week: number | null
  published: boolean
  createdByName: string
  createdAt: number
  files: ModuleFile[]
}

export const MODULES_EVENT = 'nf:modules'
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MODULES_EVENT))
}

/** Deduce el tipo por la extensión del archivo. */
export function kindOf(fileName: string): ModuleFileKind {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'ppt' || ext === 'pptx' || ext === 'key' || ext === 'odp') return 'slides'
  if (ext === 'doc' || ext === 'docx' || ext === 'txt' || ext === 'md' || ext === 'odt') return 'doc'
  return 'other'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapFile(row: any): ModuleFile {
  return {
    id: row.id,
    moduleId: row.module_id,
    name: row.name,
    url: row.url,
    kind: (row.kind ?? 'other') as ModuleFileKind,
    sizeBytes: row.size_bytes ?? 0,
    hasText: !!(row.text_content ?? '').trim(),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}

function mapModule(row: any, files: ModuleFile[]): ClassModule {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    description: row.description ?? '',
    parcial: row.parcial ?? '',
    week: row.week ?? null,
    published: !!row.published,
    createdByName: row.created_by_name ?? '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    files,
  }
}

async function currentUid(): Promise<string | undefined> {
  const id = getSession()?.id
  if (id) return id
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

/**
 * Módulos de una clase con sus archivos. RLS decide qué se ve: el catedrático
 * recibe también los ocultos, el alumno solo los publicados.
 * Orden: por semana (los sin semana al final) y luego por fecha.
 */
export async function loadModules(classId: string): Promise<ClassModule[]> {
  if (!supabase) return []
  const { data: rows } = await supabase
    .from('class_modules')
    .select('*')
    .eq('class_id', classId)
    .order('week', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  const mods = rows ?? []
  if (!mods.length) return []

  const { data: files } = await supabase
    .from('module_files')
    .select('id, module_id, name, url, kind, size_bytes, text_content, created_at')
    .in('module_id', mods.map((m: any) => m.id))
    .order('created_at', { ascending: true })

  const byModule = new Map<string, ModuleFile[]>()
  ;(files ?? []).forEach((f: any) => {
    const arr = byModule.get(f.module_id) ?? []
    arr.push(mapFile(f))
    byModule.set(f.module_id, arr)
  })

  return mods.map((m: any) => mapModule(m, byModule.get(m.id) ?? []))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Crea un módulo (nace oculto). Devuelve su id, o null si falla. */
export async function createModule(input: {
  classId: string
  title: string
  description?: string
  parcial?: string
  week?: number | null
}): Promise<string | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null
  const { data, error } = await supabase
    .from('class_modules')
    .insert({
      class_id: input.classId,
      title: input.title.trim(),
      description: input.description ?? '',
      parcial: input.parcial ?? '',
      week: input.week ?? null,
      created_by: uid,
      created_by_name: displayName(getSession()),
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('createModule', error)
    return null
  }
  dispatch()
  return data?.id ?? null
}

export async function updateModule(id: string, patch: {
  title?: string
  description?: string
  parcial?: string
  week?: number | null
}): Promise<void> {
  if (!supabase) return
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.description !== undefined) row.description = patch.description
  if (patch.parcial !== undefined) row.parcial = patch.parcial
  if (patch.week !== undefined) row.week = patch.week
  await supabase.from('class_modules').update(row).eq('id', id)
  dispatch()
}

export async function deleteModule(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('class_modules').delete().eq('id', id)
  dispatch()
}

/**
 * Publica u oculta el módulo. Al publicarlo por primera vez, la función del
 * servidor notifica a cada alumno inscrito.
 */
export async function publishModule(id: string, published: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('publish_module', { mid: id, pub: published })
  if (error) {
    console.error('publishModule', error)
    return false
  }
  dispatch()
  return true
}

/** Sube un archivo del módulo al Storage y devuelve su URL pública, o null. */
async function uploadToStorage(classId: string, file: File): Promise<string | null> {
  if (!supabase) return null
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `modules/${classId}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from('project-briefs').upload(path, file, { upsert: false })
  if (error) {
    console.error('uploadModuleFile', error)
    return null
  }
  return supabase.storage.from('project-briefs').getPublicUrl(path).data.publicUrl
}

/**
 * Agrega un archivo al módulo: lo sube al Storage y, si es PDF, extrae su texto
 * en el navegador para dejarlo listo para la IA. Que la extracción falle no
 * impide adjuntar el archivo: el alumno igual puede descargarlo.
 */
export async function addModuleFile(
  moduleId: string,
  classId: string,
  file: File,
): Promise<ModuleFile | null> {
  if (!supabase) return null
  const url = await uploadToStorage(classId, file)
  if (!url) return null

  const kind = kindOf(file.name)
  let textContent = ''
  if (kind === 'pdf') {
    try {
      const { extractPdfText } = await import('@/backend/services/classTasks')
      textContent = await extractPdfText(file)
    } catch (e) {
      console.error('extractPdfText', e)
    }
  }

  const { data, error } = await supabase
    .from('module_files')
    .insert({
      module_id: moduleId,
      name: file.name,
      url,
      kind,
      size_bytes: file.size,
      text_content: textContent,
    })
    .select('id, module_id, name, url, kind, size_bytes, text_content, created_at')
    .maybeSingle()
  if (error) {
    console.error('addModuleFile', error)
    return null
  }
  dispatch()
  return data ? mapFile(data) : null
}

/** Agrega un enlace (video, artículo, repositorio) como recurso del módulo. */
export async function addModuleLink(moduleId: string, name: string, url: string): Promise<ModuleFile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('module_files')
    .insert({
      module_id: moduleId,
      name: name.trim() || url,
      url: url.trim(),
      kind: 'link',
    })
    .select('id, module_id, name, url, kind, size_bytes, text_content, created_at')
    .maybeSingle()
  if (error) {
    console.error('addModuleLink', error)
    return null
  }
  dispatch()
  return data ? mapFile(data) : null
}

export async function deleteModuleFile(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('module_files').delete().eq('id', id)
  dispatch()
}

/**
 * Texto del material publicado de una clase, para dárselo como contexto a la IA
 * (base de la sesión de estudio). Se acota el tamaño porque el modelo tiene un
 * límite de tokens y el material de un semestre completo no cabe.
 */
export async function moduleContext(classId: string, maxChars = 12000): Promise<string> {
  if (!supabase) return ''
  const mods = await loadModules(classId)
  const visibles = mods.filter((m) => m.published)
  if (!visibles.length) return ''

  const ids = visibles.flatMap((m) => m.files.filter((f) => f.hasText).map((f) => f.id))
  if (!ids.length) return ''

  const { data } = await supabase
    .from('module_files')
    .select('module_id, name, text_content')
    .in('id', ids)

  const byModule = new Map<string, string[]>()
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  ;(data ?? []).forEach((f: any) => {
    const arr = byModule.get(f.module_id) ?? []
    arr.push(`[${f.name}]\n${f.text_content}`)
    byModule.set(f.module_id, arr)
  })

  let out = ''
  for (const m of visibles) {
    const textos = byModule.get(m.id)
    if (!textos?.length) continue
    const bloque = `## ${m.week != null ? `Semana ${m.week} — ` : ''}${m.title}\n${textos.join('\n\n')}\n\n`
    if (out.length + bloque.length > maxChars) {
      out += bloque.slice(0, Math.max(0, maxChars - out.length))
      break
    }
    out += bloque
  }
  return out.trim()
}

/** Realtime: avisa a la UI cuando el catedrático publica o cambia material. */
export function subscribeModules(): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`modules-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'class_modules' }, () => dispatch())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'module_files' }, () => dispatch())
    .subscribe()
  return () => {
    sb.removeChannel(ch)
  }
}
