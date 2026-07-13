/**
 * Store de clases — respaldado por Supabase (multiusuario real).
 * Sin "embeds" de PostgREST: consultas separadas + unión en JS (más robusto).
 * Mantiene caché en memoria + evento CLASSES_EVENT para refrescar los componentes.
 */
import { supabase } from '@/backend/supabase'
import { getSession } from '@/frontend/session/session'

export type GroupMode = 'open' | 'assign' | 'hybrid'
export type ProjectMode = 'assigned' | 'catalog' | 'proposal' | 'mixed'
export type LeaderMode = 'teacher' | 'group' | 'first'
export type GroupFormation = 'assigned' | 'open' // cómo se forman los grupos

export type Klass = {
  id: string
  name: string
  section: string
  period: string
  code: string
  emblem?: string
  teacher: string // teacher_id (uuid)
  teacherName?: string
  students: string[] // nombres de los inscritos
  roster: { id: string; name: string }[] // inscritos con uuid (para asignar grupos)
  projectMode: ProjectMode // cómo se reparten los proyectos entre grupos
  groupFormation: GroupFormation // el profe asigna vs auto-inscripción
  maxTeamSize: number // cupo de integrantes por grupo (auto-inscripción)
  createdAt: number
}

export const CLASSES_EVENT = 'nf:classes'

let cache: Klass[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLASSES_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function profName(p: any): string {
  return p?.full_name || p?.username || p?.email || 'Estudiante'
}

export function getClasses(): Klass[] {
  return cache
}
export function getClass(id: string): Klass | undefined {
  return cache.find((c) => c.id === id)
}

async function currentUid(): Promise<string | undefined> {
  const id = getSession()?.id
  if (id) return id
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

/** Carga las clases del usuario (las que imparte + en las que está inscrito). */
export async function loadClasses(): Promise<void> {
  if (!supabase) return
  const uid = await currentUid()
  if (!uid) return

  // 1) clases que imparte + ids de clases en las que está inscrito (sin embeds)
  const [ownedRes, myEnrollRes] = await Promise.all([
    supabase.from('classes').select('*').eq('teacher_id', uid),
    supabase.from('enrollments').select('class_id').eq('student_id', uid),
  ])
  const enrolledIds = (myEnrollRes.data ?? []).map((e: any) => e.class_id)

  let enrolledClasses: any[] = []
  if (enrolledIds.length) {
    const r = await supabase.from('classes').select('*').in('id', enrolledIds)
    enrolledClasses = r.data ?? []
  }

  const byId = new Map<string, any>()
  ;[...(ownedRes.data ?? []), ...enrolledClasses].forEach((r) => byId.set(r.id, r))
  const rows = Array.from(byId.values())
  const ids = rows.map((r) => r.id)

  // 2) roster de cada clase: inscripciones + perfiles (consultas separadas)
  const rosterByClass = new Map<string, { id: string; name: string }[]>()
  if (ids.length) {
    const { data: enr } = await supabase.from('enrollments').select('class_id, student_id').in('class_id', ids)
    const studentIds = Array.from(new Set((enr ?? []).map((e: any) => e.student_id)))
    const nameById = new Map<string, string>()
    if (studentIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, username, email')
        .in('id', studentIds)
      ;(profs ?? []).forEach((p: any) => nameById.set(p.id, profName(p)))
    }
    ;(enr ?? []).forEach((e: any) => {
      const arr = rosterByClass.get(e.class_id) ?? []
      arr.push({ id: e.student_id, name: nameById.get(e.student_id) ?? 'Estudiante' })
      rosterByClass.set(e.class_id, arr)
    })
  }

  cache = rows
    .map((r) => {
      const roster = rosterByClass.get(r.id) ?? []
      return {
        id: r.id,
        name: r.name,
        section: r.section ?? '',
        period: r.period ?? '',
        code: r.code,
        emblem: r.emblem ?? undefined,
        teacher: r.teacher_id,
        teacherName: r.teacher_name ?? undefined,
        students: roster.map((x) => x.name),
        roster,
        projectMode: (r.project_mode ?? 'catalog') as ProjectMode,
        groupFormation: (r.group_formation ?? 'assigned') as GroupFormation,
        maxTeamSize: r.max_team_size ?? 5,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
      } as Klass
    })
    .sort((a, b) => b.createdAt - a.createdAt)
  dispatch()
}

function randomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]
  return s
}

export async function createClass(input: {
  name: string
  section: string
  period: string
  code?: string
  emblem?: string
  teacherName?: string
}): Promise<Klass | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null
  const code = (input.code?.trim() || randomCode()).toUpperCase()
  const { error } = await supabase.from('classes').insert({
    name: input.name.trim(),
    section: input.section.trim(),
    period: input.period.trim(),
    code,
    emblem: input.emblem,
    teacher_id: uid,
    teacher_name: input.teacherName,
  })
  if (error) {
    console.error('createClass', error)
    return null
  }
  await loadClasses()
  return cache.find((c) => c.code === code) ?? null
}

/** El estudiante se une por código. Devuelve la clase o null si no existe. */
export async function joinByCode(code: string): Promise<Klass | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null
  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle()
  if (!cls) return null
  await supabase.from('enrollments').insert({ class_id: cls.id, student_id: uid })
  await loadClasses()
  return getClass(cls.id) ?? null
}

/** Cambia la modalidad de selección de proyecto de la clase (solo el catedrático). */
export async function setProjectMode(classId: string, mode: ProjectMode): Promise<void> {
  if (!supabase) return
  await supabase.from('classes').update({ project_mode: mode }).eq('id', classId)
  await loadClasses()
}

/** Cambia el modo de formación de grupos y el cupo por grupo (solo el catedrático). */
export async function setGroupFormation(classId: string, formation: GroupFormation, maxTeamSize: number): Promise<void> {
  if (!supabase) return
  await supabase
    .from('classes')
    .update({ group_formation: formation, max_team_size: Math.max(1, maxTeamSize) })
    .eq('id', classId)
  await loadClasses()
}

export async function deleteClass(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('classes').delete().eq('id', id)
  cache = cache.filter((c) => c.id !== id)
  dispatch()
}

export async function leaveClass(id: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUid()
  if (!uid) return
  await supabase.from('enrollments').delete().eq('class_id', id).eq('student_id', uid)
  await loadClasses()
}

/** Suscripción realtime: recarga las clases del usuario ante cualquier cambio. */
export function subscribeClasses(): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`classes-rt-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, () => loadClasses())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' }, () => loadClasses())
    .subscribe()
  return () => {
    sb.removeChannel(ch)
  }
}

export async function updateClass(id: string, patch: Partial<Klass>): Promise<void> {
  if (!supabase) return
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.section !== undefined) row.section = patch.section
  if (patch.period !== undefined) row.period = patch.period
  if (patch.emblem !== undefined) row.emblem = patch.emblem
  if (patch.teacherName !== undefined) row.teacher_name = patch.teacherName
  await supabase.from('classes').update(row).eq('id', id)
  await loadClasses()
}
/* eslint-enable @typescript-eslint/no-explicit-any */
