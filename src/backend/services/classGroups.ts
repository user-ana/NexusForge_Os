/**
 * Store de GRUPOS DE AULA (escuadrones) — respaldado por Supabase.
 * Los miembros se guardan por uuid (student_id). Distinto al grupo de proyecto.
 */
import { supabase } from '@/backend/supabase'
import type { Role } from '@/frontend/session/session'

export type ClassGroup = {
  id: string
  classId: string
  name: string
  icon: string // emblema 3D (ruta de imagen)
  color: string // acento del canal (hex)
  members: string[] // uuids de estudiantes
  leader?: string // uuid del líder
  projectId?: string // proyecto (enunciado) asignado a este grupo
  archived: boolean // archivado (oculto del aula, no eliminado)
  createdAt: number
}

export const CGROUPS_EVENT = 'nf:cgroups'

export const GROUP_COLORS = ['#1089d3', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899']
export const GROUP_ICONS = [
  '/icons/emblem-1.png',
  '/icons/emblem-2.png',
  '/icons/emblem-3.png',
  '/icons/emblem-4.png',
  '/icons/emblem-5.png',
  '/icons/loot-crest.png',
  '/icons/loot-core.png',
]

let cache: ClassGroup[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CGROUPS_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): ClassGroup {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    icon: row.icon ?? GROUP_ICONS[0],
    color: row.color ?? GROUP_COLORS[0],
    leader: row.leader_id ?? undefined,
    projectId: row.project_id ?? undefined,
    archived: !!row.archived,
    members: (row.group_members ?? []).map((m: any) => m.student_id),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getGroups(classId: string): ClassGroup[] {
  return cache.filter((g) => g.classId === classId).sort((a, b) => a.createdAt - b.createdAt)
}
export function getGroup(id: string): ClassGroup | undefined {
  return cache.find((g) => g.id === id)
}
/** Grupo al que pertenece un estudiante (por uuid) dentro de una clase. */
export function groupOf(classId: string, studentId: string): ClassGroup | undefined {
  return cache.find((g) => g.classId === classId && g.members.includes(studentId))
}

export async function loadGroups(classId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase
    .from('class_groups')
    .select('*, group_members(student_id)')
    .eq('class_id', classId)
  cache = [...cache.filter((g) => g.classId !== classId), ...(data ?? []).map(mapRow)]
  dispatch()
}

export async function createGroup(input: {
  classId: string
  name: string
  icon?: string
  color?: string
}): Promise<ClassGroup | null> {
  if (!supabase) return null
  const idx = getGroups(input.classId).length
  const { data, error } = await supabase
    .from('class_groups')
    .insert({
      class_id: input.classId,
      name: input.name.trim() || `Escuadrón ${idx + 1}`,
      icon: input.icon ?? GROUP_ICONS[idx % GROUP_ICONS.length],
      color: input.color ?? GROUP_COLORS[idx % GROUP_COLORS.length],
    })
    .select('*, group_members(student_id)')
    .single()
  if (error || !data) return null
  await loadGroups(input.classId)
  return mapRow(data)
}

/** Crea varias salas de una vez (Sala N+1 … N+count), con emblema y color por defecto. */
export async function createGroupsBulk(classId: string, count: number, prefix = 'Sala'): Promise<void> {
  if (!supabase || count < 1) return
  const start = getGroups(classId).length
  const rows = Array.from({ length: count }, (_, i) => {
    const idx = start + i
    return {
      class_id: classId,
      name: `${prefix} ${idx + 1}`,
      icon: GROUP_ICONS[idx % GROUP_ICONS.length],
      color: GROUP_COLORS[idx % GROUP_COLORS.length],
    }
  })
  await supabase.from('class_groups').insert(rows)
  await loadGroups(classId)
}

/**
 * Edita el nombre / emblema / color de un grupo. Lo puede hacer un integrante
 * (o el catedrático) vía una función segura del servidor. Los campos vacíos no
 * cambian el valor actual.
 */
export async function updateGroup(
  classId: string,
  groupId: string,
  patch: { name?: string; icon?: string; color?: string },
): Promise<void> {
  if (!supabase) return
  await supabase.rpc('update_group', {
    gid: groupId,
    gname: patch.name ?? '',
    gicon: patch.icon ?? '',
    gcolor: patch.color ?? '',
  })
  await loadGroups(classId)
}

export async function deleteGroup(id: string): Promise<void> {
  if (!supabase) return
  const g = getGroup(id)
  await supabase.from('class_groups').delete().eq('id', id)
  if (g) await loadGroups(g.classId)
}

/** Elimina varios grupos a la vez (solo catedrático). */
export async function deleteGroups(classId: string, ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  await supabase.from('class_groups').delete().in('id', ids)
  await loadGroups(classId)
}

/** Archiva o desarchiva varios grupos (solo catedrático). Archivar los oculta del aula. */
export async function setGroupsArchived(classId: string, ids: string[], archived: boolean): Promise<void> {
  if (!supabase || ids.length === 0) return
  await supabase.from('class_groups').update({ archived }).in('id', ids)
  await loadGroups(classId)
}

/** Asigna un estudiante (uuid) a un grupo (o lo libera con groupId=null). */
export async function assignStudent(classId: string, studentId: string, groupId: string | null): Promise<void> {
  if (!supabase) return
  const groupIds = getGroups(classId).map((g) => g.id)
  if (groupIds.length) {
    await supabase.from('group_members').delete().in('group_id', groupIds).eq('student_id', studentId)
  }
  if (groupId) {
    await supabase.from('group_members').insert({ group_id: groupId, student_id: studentId })
  }
  await loadGroups(classId)
}

/**
 * El estudiante se une por sí mismo a un grupo (modo auto-inscripción).
 * Devuelve null si funcionó, o el mensaje de error (grupo lleno, ya tiene grupo,
 * modo no activo…) que devuelve la función segura del servidor.
 */
export async function joinGroup(classId: string, groupId: string): Promise<string | null> {
  if (!supabase) return 'Sin conexión'
  const { error } = await supabase.rpc('join_class_group', { gid: groupId })
  await loadGroups(classId)
  return error ? error.message : null
}

/** Suscripción realtime a los grupos/miembros de una clase. */
export function subscribeGroups(classId: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`groups-${classId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'class_groups' }, (p) => {
      const row = (p.new ?? p.old) as { class_id?: string } | null
      if (row?.class_id && row.class_id !== classId) return
      loadGroups(classId)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => loadGroups(classId))
    .subscribe()
  return () => {
    sb.removeChannel(ch)
  }
}

export async function setLeader(groupId: string, studentId: string): Promise<void> {
  if (!supabase) return
  const g = getGroup(groupId)
  const next = g?.leader === studentId ? null : studentId
  await supabase.from('class_groups').update({ leader_id: next }).eq('id', groupId)
  if (g) await loadGroups(g.classId)
}

/**
 * Asigna un proyecto (enunciado) a un grupo. Lo puede hacer un integrante del
 * grupo (al elegir) o el catedrático (al asignar). Usa una función segura del
 * servidor que valida permisos. projectId=null lo deja sin proyecto.
 */
export async function setGroupProject(classId: string, groupId: string, projectId: string | null): Promise<void> {
  if (!supabase) return
  await supabase.rpc('set_group_project', { gid: groupId, pid: projectId })
  await loadGroups(classId)
}

/** Reparte los proyectos de la clase entre los grupos al azar (solo catedrático). */
export async function randomAssignProjects(classId: string, projectIds: string[]): Promise<void> {
  if (!supabase || projectIds.length === 0) return
  const groups = getGroups(classId)
  // baraja los proyectos y los reparte en ronda entre los grupos
  const shuffled = [...projectIds].sort(() => Math.random() - 0.5)
  for (let i = 0; i < groups.length; i++) {
    const pid = shuffled[i % shuffled.length]
    // eslint-disable-next-line no-await-in-loop
    await supabase.rpc('set_group_project', { gid: groups[i].id, pid })
  }
  await loadGroups(classId)
}

export type { Role }
