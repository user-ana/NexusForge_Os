/**
 * Ficha del ESTUDIANTE para el asistente.
 *
 * Arma en texto lo que Nexus necesita para responder «¿qué tengo pendiente?»,
 * «¿en qué grupo estoy?», «¿cuál es mi proyecto?» o «¿qué nota saqué?».
 *
 * SEGURIDAD — mismo patrón que la ficha del catedrático: se construye en el
 * NAVEGADOR con la sesión del propio estudiante, así que cada consulta pasa por
 * las políticas RLS de Supabase. Un estudiante no puede pedir datos de otro
 * porque la base no se los devuelve, no porque el código se lo pida con
 * amabilidad.
 *
 * (Sí podría inventarse un texto y mandarlo como si fuera su ficha, pero eso
 * solo engaña a su propio asistente: no da acceso a nada.)
 */
import { supabase } from '@/backend/supabase'
import { getClasses, loadClasses } from '@/backend/services/classes'
import { loadMyTasks, type MyTask } from '@/backend/services/classTasks'

const fecha = (ms: number) => new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })

/** Grupo del estudiante en una clase, con integrantes y proyecto asignado. */
type MyGroup = {
  classId: string
  name: string
  isLeader: boolean
  members: string[]
  projectTitle: string
}

async function loadMyGroups(studentId: string, classIds: string[]): Promise<MyGroup[]> {
  if (!supabase || !classIds.length) return []

  // Los grupos a los que pertenezco dentro de mis clases
  const { data: mine } = await supabase
    .from('group_members')
    .select('group_id, class_groups!inner(id, class_id, name, leader_id, project_id)')
    .eq('student_id', studentId)
  if (!mine?.length) return []

  const grupos = mine
    .map((r: any) => r.class_groups)
    .filter((g: any) => g && classIds.includes(g.class_id))
  if (!grupos.length) return []

  const groupIds = grupos.map((g: any) => g.id)
  const projIds = Array.from(new Set(grupos.map((g: any) => g.project_id).filter(Boolean)))

  const [membersRes, projRes] = await Promise.all([
    supabase.from('group_members').select('group_id, student_id').in('group_id', groupIds),
    projIds.length
      ? supabase.from('projects').select('id, title').in('id', projIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const memberIds = Array.from(new Set((membersRes.data ?? []).map((m: any) => m.student_id)))
  const nameById = new Map<string, string>()
  if (memberIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, username').in('id', memberIds)
    ;(profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name || p.username || 'Compañero'))
  }
  const projById = new Map<string, string>((projRes.data ?? []).map((p: any) => [p.id, p.title]))

  return grupos.map((g: any) => ({
    classId: g.class_id,
    name: g.name,
    isLeader: g.leader_id === studentId,
    members: (membersRes.data ?? [])
      .filter((m: any) => m.group_id === g.id)
      .map((m: any) => nameById.get(m.student_id) ?? 'Compañero'),
    projectTitle: g.project_id ? (projById.get(g.project_id) ?? '') : '',
  }))
}

/** Bloque de tareas agrupadas por estado, en el orden en que le importan al alumno. */
function tareasTexto(tasks: MyTask[]): string[] {
  const out: string[] = []
  const vencidas = tasks.filter((t) => t.state === 'overdue')
  const porHacer = tasks.filter((t) => t.state === 'pending' || t.state === 'working')
  const entregadas = tasks.filter((t) => t.state === 'submitted')

  if (vencidas.length) {
    out.push('', `TAREAS VENCIDAS SIN ENTREGAR (${vencidas.length}):`)
    vencidas.forEach((t) =>
      out.push(`- «${t.title}» · ${t.className}${t.dueDate ? ` · venció el ${fecha(t.dueDate)}` : ''}`),
    )
  }

  if (porHacer.length) {
    out.push('', `TAREAS PENDIENTES (${porHacer.length}):`)
    porHacer.forEach((t) => {
      const partes = [`- «${t.title}»`, t.className]
      if (t.dueDate) partes.push(`vence el ${fecha(t.dueDate)}`)
      if (t.points > 0) partes.push(`${t.points} pts`)
      if (t.state === 'working') partes.push('ya empezada, sin enviar')
      out.push(partes.join(' · '))
    })
  }

  if (entregadas.length) {
    out.push('', `TAREAS YA ENTREGADAS (${entregadas.length}):`)
    entregadas.forEach((t) => {
      const partes = [`- «${t.title}»`, t.className]
      if (t.submittedAt) partes.push(`entregada el ${fecha(t.submittedAt)}`)
      if (t.grade != null) partes.push(`nota: ${t.grade}${t.points > 0 ? `/${t.points}` : ''}`)
      else partes.push('sin calificar todavía')
      if (t.feedback) partes.push(`comentario del catedrático: "${t.feedback}"`)
      out.push(partes.join(' · '))
    })
  }

  if (!tasks.length) out.push('', 'TAREAS: no tiene ninguna asignada todavía.')
  return out
}

/**
 * Ficha completa en texto plano. Cadena vacía si no se puede construir.
 */
export async function getStudentContext(studentId: string): Promise<string> {
  if (!supabase || !studentId) return ''

  await loadClasses()
  const clases = getClasses()
  if (!clases.length) return 'El estudiante todavía no se ha unido a ninguna clase.'

  const [tasks, grupos] = await Promise.all([
    loadMyTasks(),
    loadMyGroups(studentId, clases.map((c) => c.id)),
  ])
  const grupoPorClase = new Map(grupos.map((g) => [g.classId, g]))

  const lineas: string[] = [`MIS CLASES (${clases.length}):`]
  for (const c of clases) {
    const cab = [`- ${c.name}${c.section ? ` (sección ${c.section})` : ''}`]
    if (c.teacherName) cab.push(`catedrático: ${c.teacherName}`)
    if (c.period) cab.push(`período: ${c.period}`)
    lineas.push(cab.join(' · '))

    const g = grupoPorClase.get(c.id)
    if (g) {
      lineas.push(`  Mi grupo: ${g.name}${g.isLeader ? ' (soy el líder)' : ''}`)
      if (g.members.length > 1) lineas.push(`  Integrantes: ${g.members.join(', ')}`)
      lineas.push(`  Proyecto asignado: ${g.projectTitle || 'todavía ninguno'}`)
    } else {
      lineas.push('  Todavía no estoy en ningún grupo de esta clase.')
    }
  }

  lineas.push(...tareasTexto(tasks))
  return lineas.join('\n')
}
