/**
 * Acciones del catedrático que la IA puede pedir (crear clase, grupos, proyecto,
 * tarea, asignar, eliminar). Se extrajo aquí para que el asistente inmersivo
 * (/dashboard/asistente) las ejecute con la MISMA lógica y validaciones que el
 * orbe flotante, sin duplicar el ejecutor.
 *
 * Todo corre del lado del cliente, con los permisos del propio catedrático.
 */
import { getSession, displayName } from '@/frontend/session/session'
import { getClasses, loadClasses, createClass, deleteClass } from '@/backend/services/classes'
import { createGroupsBulk, GROUP_ICONS, loadGroups, getGroups, setGroupProject } from '@/backend/services/classGroups'
import { createProject, loadProjects, getProjects } from '@/backend/services/projects'
import { createClassTask } from '@/backend/services/classTasks'
import { type ParcialCode } from '@/shared/parciales'

export type ToolCall = { name: string; args: Record<string, unknown> }

/** Busca una clase del catedrático por nombre aproximado. */
export function findClass(meId: string, name: string) {
  const q = name.trim().toLowerCase()
  if (!q) return undefined
  return getClasses()
    .filter((c) => c.teacher === meId)
    .find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()))
}

/** ¿Un dato de la acción realmente aparece en el mensaje? (evita que la IA invente). */
export function argInQuestion(arg: string, question: string): boolean {
  const nq = question.toLowerCase()
  const words = String(arg).toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  return words.length > 0 && words.some((w) => nq.includes(w))
}

/** Corrige la herramienta si contradice el verbo del catedrático (crear vs eliminar). */
export function correctTool(tc: ToolCall, q: string): ToolCall {
  const s = q.toLowerCase()
  const wantsDelete = /(elimin|borra|dar de baja|quita)/.test(s)
  const wantsCreate = /(crea|crear|agrega|nuev|añad)/.test(s)
  const nameMatch = q.match(/clase\s+(?:de\s+)?(.+)/i)
  const name = nameMatch ? nameMatch[1].trim() : ''
  if (wantsCreate && !wantsDelete && tc.name === 'eliminar_clase') {
    return { name: 'crear_clase', args: { nombre: name } }
  }
  if (wantsDelete && !wantsCreate && tc.name.startsWith('crear')) {
    return { name: 'eliminar_clase', args: { clase: name } }
  }
  return tc
}

/** Dato que falta en la acción (para preguntarlo), validando contra lo que dijo el profe. */
export function nextMissing(tc: ToolCall, userText: string): { field: string; question: string } | null {
  if (tc.name === 'crear_clase') {
    if (!argInQuestion(String(tc.args.nombre ?? ''), userText)) return { field: 'nombre', question: '¿Qué nombre le ponemos a la clase?' }
  }
  if (tc.name === 'crear_grupos') {
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿En qué clase creo los grupos?' }
    if (!(Number(tc.args.cantidad) > 0)) return { field: 'cantidad', question: '¿Cuántos grupos creo?' }
  }
  if (tc.name === 'crear_proyecto') {
    if (!argInQuestion(String(tc.args.titulo ?? ''), userText)) return { field: 'titulo', question: '¿Cómo se llama el proyecto?' }
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿En qué clase creo el proyecto?' }
  }
  if (tc.name === 'asignar_proyecto') {
    if (!argInQuestion(String(tc.args.proyecto ?? ''), userText)) return { field: 'proyecto', question: '¿Qué proyecto quieres asignar?' }
    if (!argInQuestion(String(tc.args.grupo ?? ''), userText)) return { field: 'grupo', question: '¿A qué grupo se lo asigno?' }
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿En qué clase está ese grupo?' }
  }
  if (tc.name === 'crear_tarea') {
    if (!argInQuestion(String(tc.args.titulo ?? ''), userText)) return { field: 'titulo', question: '¿Cómo se llama la tarea?' }
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿Para qué clase es la tarea?' }
  }
  if (tc.name === 'eliminar_clase') {
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿Qué clase quieres eliminar?' }
  }
  return null
}

/** Aviso previo si la acción parece chocar con el estado actual (duplicado / clase inexistente). */
export function actionWarning(meId: string, tc: ToolCall): string | undefined {
  if (tc.name === 'crear_clase') {
    const n = String(tc.args.nombre ?? '').trim()
    if (n && findClass(meId, n)) return `Ya existe una clase parecida a «${n}». ¿Seguro que quieres otra?`
  } else if (tc.name === 'crear_grupos' || tc.name === 'crear_proyecto' || tc.name === 'asignar_proyecto' || tc.name === 'crear_tarea') {
    const c = String(tc.args.clase ?? '').trim()
    if (c && !findClass(meId, c)) return `No encuentro una clase llamada «${c}». Revisa el nombre o créala primero.`
  } else if (tc.name === 'eliminar_clase') {
    const c = String(tc.args.clase ?? '').trim()
    if (c && !findClass(meId, c)) return `No encuentro una clase llamada «${c}».`
  }
  return undefined
}

/** Interpreta una fecha límite escrita en lenguaje natural (best-effort). null si no se entiende. */
export function parseDueText(s: string): number | null {
  const x = s.trim().toLowerCase()
  if (!x) return null
  const now = new Date(Date.now())
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre']
  let m = x.match(/(\d{1,2})\s+de\s+([a-záéí]+)(?:\s+de\s+(\d{4}))?/)
  if (m) {
    const day = Number(m[1])
    const mi = meses.findIndex((n) => m![2].startsWith(n.slice(0, 4)))
    if (mi >= 0) {
      const monthIdx = mi === 10 ? 9 : mi > 10 ? mi - 1 : mi
      const year = m[3] ? Number(m[3]) : now.getFullYear()
      return new Date(year, monthIdx, day, 23, 59).getTime()
    }
  }
  m = x.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (m) {
    const day = Number(m[1]); const mon = Number(m[2]) - 1
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear()
    return new Date(year, mon, day, 23, 59).getTime()
  }
  return null
}

/** Código de clase estructurado a partir del nombre (ej. "Estructura de Datos" -> "ED-2026-K7"). */
export function codeFromName(name: string): string {
  const words = name.toUpperCase().split(/\s+/).filter((w) => w.length > 2)
  const initials = (words.map((w) => w[0]).join('') || 'CL').slice(0, 4)
  const year = new Date(Date.now()).getFullYear()
  const rand = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${initials}-${year}-${rand}`
}

export function normParcial(s: string): ParcialCode {
  const x = s.toLowerCase()
  if (/final/.test(x)) return 'final'
  if (/3|terc/.test(x)) return 'p3'
  if (/2|seg/.test(x)) return 'p2'
  if (/1|prim/.test(x)) return 'p1'
  return ''
}

/** Frase legible que describe lo que la IA quiere hacer (para la tarjeta de confirmación). */
export function describeAction({ name, args }: ToolCall): string {
  if (name === 'crear_clase')
    return `Crear la clase «${args.nombre}»${args.seccion ? ` (sección ${args.seccion})` : ''}${args.periodo ? `, período ${args.periodo}` : ''}.`
  if (name === 'crear_grupos') return `Crear ${args.cantidad} grupo(s) en la clase «${args.clase}».`
  if (name === 'crear_proyecto')
    return `Crear el proyecto «${args.titulo}» en la clase «${args.clase}»${args.parcial ? ` (${args.parcial})` : ''}.`
  if (name === 'crear_tarea') {
    const due = parseDueText(String(args.fecha ?? ''))
    const fecha = due ? ` · vence ${new Date(due).toLocaleDateString('es', { day: '2-digit', month: 'short' })}` : ''
    return `Publicar la tarea «${args.titulo}» para toda la clase «${args.clase}»${args.parcial ? ` (${args.parcial})` : ''}${fecha}, y notificar a los alumnos.`
  }
  if (name === 'asignar_proyecto')
    return `Asignar el proyecto «${args.proyecto}» al grupo «${args.grupo}» de la clase «${args.clase}».`
  if (name === 'eliminar_clase')
    return `Eliminar la clase «${args.clase}» y todo su contenido (grupos, proyectos, chats). Esto no se puede deshacer.`
  return 'Acción desconocida.'
}

/**
 * Ejecuta la acción que pidió la IA. Devuelve un mensaje de resultado para
 * mostrar en la tarjeta. `ok` indica si se completó (para refrescar el contexto).
 */
export async function executeToolCall(meId: string, tc: ToolCall): Promise<{ ok: boolean; message: string }> {
  const { name, args } = tc
  const teacherName = displayName(getSession())
  try {
    if (name === 'crear_clase') {
      const nombre = String(args.nombre ?? '').trim()
      const k = await createClass({
        name: nombre,
        section: String(args.seccion ?? ''),
        period: String(args.periodo ?? ''),
        code: codeFromName(nombre),
        emblem: GROUP_ICONS[Math.floor(Math.random() * GROUP_ICONS.length)],
        teacherName,
      })
      return k ? { ok: true, message: `Clase «${k.name}» creada (código ${k.code}).` } : { ok: false, message: 'No se pudo crear la clase.' }
    }
    if (name === 'crear_grupos') {
      await loadClasses()
      const cls = findClass(meId, String(args.clase ?? ''))
      if (!cls) return { ok: false, message: `No encontré una clase llamada «${args.clase}».` }
      const n = Math.max(1, Math.min(30, Number(args.cantidad) || 1))
      await createGroupsBulk(cls.id, n)
      return { ok: true, message: `Creé ${n} grupo(s) en «${cls.name}».` }
    }
    if (name === 'crear_proyecto') {
      await loadClasses()
      const cls = findClass(meId, String(args.clase ?? ''))
      if (!cls) return { ok: false, message: `No encontré una clase llamada «${args.clase}».` }
      const p = await createProject({
        classId: cls.id,
        title: String(args.titulo ?? '').trim(),
        description: String(args.descripcion ?? ''),
        objectives: '',
        deliverables: '',
        rubric: [],
        dueDate: '',
        teamSize: 4,
        groupMode: 'open',
        leaderMode: 'first',
        parcial: normParcial(String(args.parcial ?? '')),
        briefUrl: '',
        requirements: '',
      })
      return p ? { ok: true, message: `Proyecto «${p.title}» creado en «${cls.name}».` } : { ok: false, message: 'No se pudo crear el proyecto.' }
    }
    if (name === 'asignar_proyecto') {
      await loadClasses()
      const cls = findClass(meId, String(args.clase ?? ''))
      if (!cls) return { ok: false, message: `No encontré una clase llamada «${args.clase}».` }
      await Promise.all([loadGroups(cls.id), loadProjects(cls.id)])
      const gq = String(args.grupo ?? '').trim().toLowerCase()
      const pq = String(args.proyecto ?? '').trim().toLowerCase()
      const grp = getGroups(cls.id).find((g) => g.name.toLowerCase().includes(gq) || gq.includes(g.name.toLowerCase()))
      const proj = getProjects(cls.id).find((p) => p.title.toLowerCase().includes(pq) || pq.includes(p.title.toLowerCase()))
      if (!grp) return { ok: false, message: `No encontré el grupo «${args.grupo}» en «${cls.name}».` }
      if (!proj) return { ok: false, message: `No encontré el proyecto «${args.proyecto}» en «${cls.name}».` }
      await setGroupProject(cls.id, grp.id, proj.id)
      return { ok: true, message: `Asigné el proyecto «${proj.title}» al grupo «${grp.name}».` }
    }
    if (name === 'crear_tarea') {
      await loadClasses()
      const cls = findClass(meId, String(args.clase ?? ''))
      if (!cls) return { ok: false, message: `No encontré una clase llamada «${args.clase}».` }
      const ok = await createClassTask({
        classId: cls.id,
        title: String(args.titulo ?? '').trim(),
        description: String(args.descripcion ?? '').trim(),
        parcial: normParcial(String(args.parcial ?? '')),
        dueDate: parseDueText(String(args.fecha ?? '')),
      })
      return ok
        ? { ok: true, message: `Tarea «${String(args.titulo ?? '').trim()}» publicada en «${cls.name}» y notificada a los alumnos.` }
        : { ok: false, message: 'No se pudo publicar la tarea.' }
    }
    if (name === 'eliminar_clase') {
      await loadClasses()
      const cls = findClass(meId, String(args.clase ?? ''))
      if (!cls) return { ok: false, message: `No encontré una clase llamada «${args.clase}».` }
      await deleteClass(cls.id)
      return { ok: true, message: `Clase «${cls.name}» eliminada.` }
    }
    return { ok: false, message: 'No reconozco esa acción.' }
  } catch {
    return { ok: false, message: 'Ocurrió un error al ejecutar la acción.' }
  }
}
