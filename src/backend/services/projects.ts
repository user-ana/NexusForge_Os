/**
 * Store de proyectos — respaldado por Supabase.
 * Un proyecto pertenece a una clase y lleva el enunciado + modalidades de grupo.
 */
import { supabase } from '@/backend/supabase'
import type { GroupMode, LeaderMode } from '@/backend/services/classes'

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

export async function deleteProject(id: string): Promise<void> {
  if (!supabase) return
  const p = getProject(id)
  await supabase.from('projects').delete().eq('id', id)
  if (p) await loadProjects(p.classId)
}
