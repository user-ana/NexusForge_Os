/**
 * Store de proyectos — respaldado por Supabase.
 * Un proyecto pertenece a una clase y lleva el enunciado + modalidades de grupo.
 */
import { supabase } from '@/backend/supabase'
import type { GroupMode, LeaderMode } from '@/backend/services/classes'
import type { ParcialCode } from '@/shared/parciales'

export type RubricItem = { criterion: string; points: number }

export type Project = {
  id: string
  classId: string
  title: string
  description: string
  objectives: string
  deliverables: string
  rubric: RubricItem[]
  dueDate: string
  teamSize: number
  groupMode: GroupMode
  leaderMode: LeaderMode
  parcial: ParcialCode
  briefUrl: string
  requirements: string
  createdAt: number
}

export const PROJECTS_EVENT = 'nf:projects'

let cache: Project[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROJECTS_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): Project {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    description: row.description ?? '',
    objectives: row.objectives ?? '',
    deliverables: row.deliverables ?? '',
    rubric: (row.rubric ?? []) as RubricItem[],
    dueDate: row.due_date ?? '',
    teamSize: row.team_size ?? 4,
    groupMode: (row.group_mode ?? 'open') as GroupMode,
    leaderMode: (row.leader_mode ?? 'first') as LeaderMode,
    parcial: (row.parcial ?? '') as ParcialCode,
    briefUrl: row.brief_url ?? '',
    requirements: row.requirements ?? '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getProjects(classId: string): Project[] {
  return cache.filter((p) => p.classId === classId).sort((a, b) => b.createdAt - a.createdAt)
}
export function getProject(id: string): Project | undefined {
  return cache.find((p) => p.id === id)
}

export async function loadProjects(classId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.from('projects').select('*').eq('class_id', classId)
  cache = [...cache.filter((p) => p.classId !== classId), ...(data ?? []).map(mapRow)]
  dispatch()
}

/** Carga los proyectos de varias clases de una sola vez (para la Vista por Períodos). */
export async function loadProjectsForClasses(classIds: string[]): Promise<void> {
  if (!supabase || classIds.length === 0) return
  const { data } = await supabase.from('projects').select('*').in('class_id', classIds)
  const set = new Set(classIds)
  cache = [...cache.filter((p) => !set.has(p.classId)), ...(data ?? []).map(mapRow)]
  dispatch()
}

/** Proyectos (desde caché) de un conjunto de clases, más recientes primero. */
export function getProjectsForClasses(classIds: string[]): Project[] {
  const set = new Set(classIds)
  return cache.filter((p) => set.has(p.classId)).sort((a, b) => b.createdAt - a.createdAt)
}

export async function createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('projects')
    .insert({
      class_id: input.classId,
      title: input.title,
      description: input.description,
      objectives: input.objectives,
      deliverables: input.deliverables,
      rubric: input.rubric,
      due_date: input.dueDate,
      team_size: input.teamSize,
      group_mode: input.groupMode,
      leader_mode: input.leaderMode,
      parcial: input.parcial,
      brief_url: input.briefUrl,
      requirements: input.requirements,
    })
    .select('*')
    .single()
  if (error || !data) return null
  await loadProjects(input.classId)
  return mapRow(data)
}

/** Suscripción realtime a los proyectos de una clase. */
export function subscribeProjects(classId: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`projects-${classId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (p) => {
      const row = (p.new ?? p.old) as { class_id?: string } | null
      if (row?.class_id && row.class_id !== classId) return
      loadProjects(classId)
    })
    .subscribe()
  return () => {
    sb.removeChannel(ch)
  }
}

/**
 * Sube un archivo (PDF/Word) del enunciado al bucket 'project-briefs' de Storage
 * y devuelve su URL pública, o null si falla (p. ej. el bucket no existe todavía).
 */
export async function uploadBrief(classId: string, file: File): Promise<string | null> {
  if (!supabase) return null
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${classId}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from('project-briefs').upload(path, file, { upsert: false })
  if (error) return null
  return supabase.storage.from('project-briefs').getPublicUrl(path).data.publicUrl
}

export async function deleteProject(id: string): Promise<void> {
  if (!supabase) return
  const p = getProject(id)
  await supabase.from('projects').delete().eq('id', id)
  if (p) await loadProjects(p.classId)
}
