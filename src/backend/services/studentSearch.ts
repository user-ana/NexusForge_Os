/**
 * Buscador de estudiantes (para el catedrático): dado un nombre, reúne el
 * "expediente" completo de cada estudiante que coincida, SOLO dentro de las
 * clases que imparte quien busca. Es la base del asistente/buscador con IA.
 */
import { supabase } from '@/backend/supabase'

export type StudentClassInfo = {
  classId: string
  className: string
  section: string
  groupName?: string
  groupColor?: string
  isLeader: boolean
  projectTitle?: string
  briefUrl?: string
  deliverable?: { title: string; repoUrl: string; deployUrl: string; videoUrl: string }
  grade: number | null
  maxPoints: number | null
  tasks: { todo: number; doing: number; done: number }
}

export type StudentDossier = {
  id: string
  name: string
  email?: string
  career?: string
  accountNumber?: string
  avatar?: string
  classes: StudentClassInfo[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function profName(p: any): string {
  return p?.full_name || p?.username || p?.email || 'Estudiante'
}

export type QuickStudent = { id: string; name: string; className: string }
export type QuickGroup = { id: string; name: string; color: string; className: string; projectTitle?: string }

export type AssistantOverview = {
  classCount: number
  studentCount: number
  groupCount: number
  ungradedCount: number
  gradedCount: number // grupos con nota registrada
  freeStudents: QuickStudent[] // inscritos sin grupo
  groupsNoProject: QuickGroup[] // grupos sin proyecto asignado
  ungraded: QuickGroup[] // grupos con entrega pero sin nota
  noSubmission: QuickGroup[] // grupos con proyecto pero sin entrega
}

/**
 * Panorama del catedrático para el centro de comando del asistente:
 * estadísticas + listas accionables (sin grupo, sin proyecto, sin calificar,
 * sin entrega). Todo dentro de las clases que imparte.
 */
export async function getAssistantOverview(teacherId: string): Promise<AssistantOverview> {
  const empty: AssistantOverview = {
    classCount: 0, studentCount: 0, groupCount: 0, ungradedCount: 0, gradedCount: 0,
    freeStudents: [], groupsNoProject: [], ungraded: [], noSubmission: [],
  }
  if (!supabase) return empty

  const { data: classes } = await supabase.from('classes').select('id, name, section').eq('teacher_id', teacherId)
  const classIds = (classes ?? []).map((c: any) => c.id)
  empty.classCount = classes?.length ?? 0
  if (!classIds.length) return empty
  const classById = new Map<string, any>((classes ?? []).map((c: any) => [c.id, c]))

  const [enrRes, groupsRes] = await Promise.all([
    supabase.from('enrollments').select('class_id, student_id').in('class_id', classIds),
    supabase.from('class_groups').select('id, class_id, name, color, project_id, group_members(student_id)').in('class_id', classIds),
  ])
  const enr = enrRes.data ?? []
  const groups = groupsRes.data ?? []
  const studentIds = Array.from(new Set(enr.map((e: any) => e.student_id)))

  const nameById = new Map<string, string>()
  if (studentIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, username, email').in('id', studentIds)
    ;(profs ?? []).forEach((p: any) => nameById.set(p.id, profName(p)))
  }

  const inGroup = new Set<string>()
  groups.forEach((g: any) => (g.group_members ?? []).forEach((m: any) => inGroup.add(m.student_id)))

  // Inscritos sin grupo
  const freeStudents: QuickStudent[] = []
  const seenFree = new Set<string>()
  enr.forEach((e: any) => {
    if (inGroup.has(e.student_id) || seenFree.has(e.student_id)) return
    seenFree.add(e.student_id)
    freeStudents.push({ id: e.student_id, name: nameById.get(e.student_id) ?? 'Estudiante', className: classById.get(e.class_id)?.name ?? '—' })
  })

  // Títulos de proyectos asignados
  const projIds = Array.from(new Set(groups.map((g: any) => g.project_id).filter(Boolean)))
  const projById = new Map<string, any>()
  if (projIds.length) {
    const { data: projs } = await supabase.from('projects').select('id, title').in('id', projIds)
    ;(projs ?? []).forEach((p: any) => projById.set(p.id, p))
  }

  const groupIds = groups.map((g: any) => g.id)
  const [gpRes, geRes] = await Promise.all([
    groupIds.length ? supabase.from('group_projects').select('group_id, title, repo_url, deploy_url, video_url').in('group_id', groupIds) : Promise.resolve({ data: [] as any[] }),
    groupIds.length ? supabase.from('group_evaluations').select('group_id, grade').in('group_id', groupIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const gpByGroup = new Map<string, any>((gpRes.data ?? []).map((r: any) => [r.group_id, r]))
  const gradedGroups = new Set<string>((geRes.data ?? []).filter((r: any) => r.grade != null).map((r: any) => r.group_id))

  function hasSubmission(gid: string): boolean {
    const gp = gpByGroup.get(gid)
    return !!gp && !!((gp.title ?? '').trim() || (gp.repo_url ?? '').trim() || (gp.deploy_url ?? '').trim() || (gp.video_url ?? '').trim())
  }

  const groupsNoProject: QuickGroup[] = []
  const ungraded: QuickGroup[] = []
  const noSubmission: QuickGroup[] = []
  groups.forEach((g: any) => {
    const qg: QuickGroup = {
      id: g.id,
      name: g.name,
      color: g.color,
      className: classById.get(g.class_id)?.name ?? '—',
      projectTitle: g.project_id ? projById.get(g.project_id)?.title : undefined,
    }
    if (!g.project_id) groupsNoProject.push(qg)
    const submitted = hasSubmission(g.id)
    if (submitted && !gradedGroups.has(g.id)) ungraded.push(qg)
    if (g.project_id && !submitted) noSubmission.push(qg)
  })

  return {
    classCount: classes?.length ?? 0,
    studentCount: studentIds.length,
    groupCount: groups.length,
    ungradedCount: ungraded.length,
    gradedCount: gradedGroups.size,
    freeStudents,
    groupsNoProject,
    ungraded,
    noSubmission,
  }
}

/**
 * Resumen de texto de TODA la clase del catedrático, para dárselo como contexto
 * al LLM (RAG). Compacto pero completo: clases, estudiantes y grupos con su estado.
 */
export async function getAssistantContext(teacherId: string): Promise<string> {
  if (!supabase) return ''
  const { data: classes } = await supabase.from('classes').select('id, name, section, code').eq('teacher_id', teacherId)
  const classIds = (classes ?? []).map((c: any) => c.id)
  if (!classIds.length) return 'El catedrático no tiene clases todavía.'
  const classById = new Map<string, any>((classes ?? []).map((c: any) => [c.id, c]))

  const [enrRes, groupsRes] = await Promise.all([
    supabase.from('enrollments').select('class_id, student_id').in('class_id', classIds),
    supabase.from('class_groups').select('id, class_id, name, project_id, leader_id, group_members(student_id)').in('class_id', classIds),
  ])
  const enr = enrRes.data ?? []
  const groups = groupsRes.data ?? []
  const studentIds = Array.from(new Set(enr.map((e: any) => e.student_id)))

  const profById = new Map<string, any>()
  if (studentIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, username, email, career, account_number').in('id', studentIds)
    ;(profs ?? []).forEach((p: any) => profById.set(p.id, p))
  }
  const projIds = Array.from(new Set(groups.map((g: any) => g.project_id).filter(Boolean)))
  const projById = new Map<string, any>()
  if (projIds.length) {
    const { data: projs } = await supabase.from('projects').select('id, title').in('id', projIds)
    ;(projs ?? []).forEach((p: any) => projById.set(p.id, p))
  }
  const groupIds = groups.map((g: any) => g.id)
  const [gpRes, geRes, kanRes] = await Promise.all([
    groupIds.length ? supabase.from('group_projects').select('group_id, title, repo_url, deploy_url, video_url').in('group_id', groupIds) : Promise.resolve({ data: [] as any[] }),
    groupIds.length ? supabase.from('group_evaluations').select('group_id, grade, max_points').in('group_id', groupIds) : Promise.resolve({ data: [] as any[] }),
    groupIds.length ? supabase.from('kanban_tasks').select('group_id, col').in('group_id', groupIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const gpByGroup = new Map<string, any>((gpRes.data ?? []).map((r: any) => [r.group_id, r]))
  const geByGroup = new Map<string, any>((geRes.data ?? []).map((r: any) => [r.group_id, r]))
  const taskCount = new Map<string, { pend: number; done: number; total: number }>()
  ;(kanRes.data ?? []).forEach((t: any) => {
    const a = taskCount.get(t.group_id) ?? { pend: 0, done: 0, total: 0 }
    a.total++
    if (t.col === 'done') a.done++
    else a.pend++
    taskCount.set(t.group_id, a)
  })

  function groupOfStudent(sid: string, cid: string): any | undefined {
    return groups.find((g: any) => g.class_id === cid && (g.group_members ?? []).some((m: any) => m.student_id === sid))
  }
  function hasSubmission(g: any): boolean {
    const gp = gpByGroup.get(g.id)
    return !!gp && !!((gp.title ?? '').trim() || (gp.repo_url ?? '').trim() || (gp.deploy_url ?? '').trim() || (gp.video_url ?? '').trim())
  }

  const lines: string[] = ['CLASES:']
  ;(classes ?? []).forEach((c: any) => {
    const gc = groups.filter((g: any) => g.class_id === c.id).length
    const sc = enr.filter((e: any) => e.class_id === c.id).length
    lines.push(`- ${c.name}${c.section ? ` (${c.section})` : ''} [código ${c.code}]: ${sc} estudiantes, ${gc} grupos`)
  })

  lines.push('', 'ESTUDIANTES:')
  const seen = new Set<string>()
  enr.forEach((e: any) => {
    const key = `${e.student_id}|${e.class_id}`
    if (seen.has(key)) return
    seen.add(key)
    const p = profById.get(e.student_id)
    const name = p?.full_name || p?.username || p?.email || 'Estudiante'
    const c = classById.get(e.class_id)
    const g = groupOfStudent(e.student_id, e.class_id)
    const proj = g?.project_id ? projById.get(g.project_id)?.title : null
    const ge = g ? geByGroup.get(g.id) : null
    const grade = ge?.grade != null ? `${ge.grade}${ge.max_points != null ? `/${ge.max_points}` : ''}` : 'sin calificar'
    lines.push(`- ${name}${p?.career ? ` (${p.career})` : ''} | clase ${c?.name} | grupo ${g ? g.name + (g.leader_id === e.student_id ? ' (líder)' : '') : 'SIN GRUPO'} | proyecto ${proj || 'ninguno'} | nota ${grade}`)
  })

  lines.push('', 'GRUPOS:')
  groups.forEach((g: any) => {
    const c = classById.get(g.class_id)
    const proj = g.project_id ? projById.get(g.project_id)?.title : null
    const ge = geByGroup.get(g.id)
    const grade = ge?.grade != null ? `${ge.grade}` : 'sin calificar'
    const tc = taskCount.get(g.id)
    lines.push(`- ${g.name} (clase ${c?.name}): proyecto ${proj || 'ninguno'}, ${(g.group_members ?? []).length} integrantes, entrega ${hasSubmission(g) ? 'sí' : 'no'}, nota ${grade}${tc ? `, tareas ${tc.done}/${tc.total} hechas` : ''}`)
  })

  return lines.join('\n')
}

/**
 * Busca estudiantes por nombre (o número de cuenta) dentro de las clases del
 * catedrático y devuelve su expediente completo por clase.
 */
export async function searchStudents(teacherId: string, query: string): Promise<StudentDossier[]> {
  if (!supabase || !query.trim()) return []
  const q = query.trim().toLowerCase()

  // 1) Clases del catedrático
  const { data: classes } = await supabase.from('classes').select('id, name, section').eq('teacher_id', teacherId)
  const classIds = (classes ?? []).map((c: any) => c.id)
  if (!classIds.length) return []
  const classById = new Map<string, any>((classes ?? []).map((c: any) => [c.id, c]))

  // 2) Inscripciones en esas clases + perfiles, filtrando por nombre/cuenta
  const { data: enr } = await supabase.from('enrollments').select('class_id, student_id').in('class_id', classIds)
  const studentIds = Array.from(new Set((enr ?? []).map((e: any) => e.student_id)))
  if (!studentIds.length) return []

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, career, account_number, avatar')
    .in('id', studentIds)

  const matched = (profs ?? []).filter((p: any) => {
    const name = profName(p).toLowerCase()
    return name.includes(q) || (p.account_number ?? '').toLowerCase().includes(q)
  })
  if (!matched.length) return []
  const matchedIds = new Set(matched.map((p: any) => p.id))

  // student -> classIds donde está inscrito (dentro de las del profe)
  const classesByStudent = new Map<string, string[]>()
  ;(enr ?? []).forEach((e: any) => {
    if (!matchedIds.has(e.student_id)) return
    const arr = classesByStudent.get(e.student_id) ?? []
    arr.push(e.class_id)
    classesByStudent.set(e.student_id, arr)
  })

  // 3) Grupos + miembros de esas clases
  const { data: groups } = await supabase
    .from('class_groups')
    .select('id, class_id, name, color, leader_id, project_id, group_members(student_id)')
    .in('class_id', classIds)
  const groupList = groups ?? []

  // 4) Enunciados (proyectos) asignados a esos grupos
  const projectIds = Array.from(new Set(groupList.map((g: any) => g.project_id).filter(Boolean)))
  const projById = new Map<string, any>()
  if (projectIds.length) {
    const { data: projects } = await supabase.from('projects').select('id, title, brief_url').in('id', projectIds)
    ;(projects ?? []).forEach((p: any) => projById.set(p.id, p))
  }

  // 5) Entregas, evaluaciones y tareas de los grupos relevantes
  const relevantGroupIds = groupList
    .filter((g: any) => (g.group_members ?? []).some((m: any) => matchedIds.has(m.student_id)))
    .map((g: any) => g.id)

  const [gpRes, geRes, kanRes] = await Promise.all([
    relevantGroupIds.length ? supabase.from('group_projects').select('*').in('group_id', relevantGroupIds) : Promise.resolve({ data: [] as any[] }),
    relevantGroupIds.length ? supabase.from('group_evaluations').select('*').in('group_id', relevantGroupIds) : Promise.resolve({ data: [] as any[] }),
    relevantGroupIds.length ? supabase.from('kanban_tasks').select('group_id, col').in('group_id', relevantGroupIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const gpByGroup = new Map<string, any>((gpRes.data ?? []).map((r: any) => [r.group_id, r]))
  const geByGroup = new Map<string, any>((geRes.data ?? []).map((r: any) => [r.group_id, r]))
  const tasksByGroup = new Map<string, { todo: number; doing: number; done: number }>()
  ;(kanRes.data ?? []).forEach((t: any) => {
    const acc = tasksByGroup.get(t.group_id) ?? { todo: 0, doing: 0, done: 0 }
    if (t.col === 'todo' || t.col === 'doing' || t.col === 'done') acc[t.col as 'todo' | 'doing' | 'done']++
    tasksByGroup.set(t.group_id, acc)
  })

  // grupo del estudiante por clase
  function groupOfStudentInClass(studentId: string, classId: string): any | undefined {
    return groupList.find(
      (g: any) => g.class_id === classId && (g.group_members ?? []).some((m: any) => m.student_id === studentId),
    )
  }

  // 6) Ensamblar el expediente
  return matched.map((p: any) => {
    const clsInfos: StudentClassInfo[] = (classesByStudent.get(p.id) ?? []).map((cid) => {
      const c = classById.get(cid)
      const g = groupOfStudentInClass(p.id, cid)
      const proj = g?.project_id ? projById.get(g.project_id) : undefined
      const gp = g ? gpByGroup.get(g.id) : undefined
      const ge = g ? geByGroup.get(g.id) : undefined
      return {
        classId: cid,
        className: c?.name ?? '—',
        section: c?.section ?? '',
        groupName: g?.name,
        groupColor: g?.color,
        isLeader: !!g && g.leader_id === p.id,
        projectTitle: proj?.title,
        briefUrl: proj?.brief_url ?? '',
        deliverable: gp
          ? { title: gp.title ?? '', repoUrl: gp.repo_url ?? '', deployUrl: gp.deploy_url ?? '', videoUrl: gp.video_url ?? '' }
          : undefined,
        grade: ge?.grade ?? null,
        maxPoints: ge?.max_points ?? null,
        tasks: (g && tasksByGroup.get(g.id)) || { todo: 0, doing: 0, done: 0 },
      }
    })
    return {
      id: p.id,
      name: profName(p),
      email: p.email ?? undefined,
      career: p.career ?? undefined,
      accountNumber: p.account_number ?? undefined,
      avatar: p.avatar ?? undefined,
      classes: clsInfos,
    }
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
