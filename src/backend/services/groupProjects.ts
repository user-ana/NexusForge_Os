/**
 * Proyecto (showcase) de cada grupo — respaldado por Supabase, con realtime.
 * Un registro por grupo: título, descripción y enlaces del entregable
 * (repositorio de GitHub, despliegue y video).
 */
import { supabase } from '@/backend/supabase'
import { onBusChange, notifyBusChange } from '@/backend/realtime/realtimeBus'

export type GroupProject = {
  groupId: string
  title: string
  description: string
  repoUrl: string
  deployUrl: string
  videoUrl: string
}

export const GPROJECT_EVENT = 'nf:gproject'

const roomKey = (groupId: string) => `gp-${groupId}`

let cache: Record<string, GroupProject> = {}
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GPROJECT_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): GroupProject {
  return {
    groupId: row.group_id,
    title: row.title ?? '',
    description: row.description ?? '',
    repoUrl: row.repo_url ?? '',
    deployUrl: row.deploy_url ?? '',
    videoUrl: row.video_url ?? '',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const empty = (groupId: string): GroupProject => ({
  groupId,
  title: '',
  description: '',
  repoUrl: '',
  deployUrl: '',
  videoUrl: '',
})

export function getProject(groupId: string): GroupProject {
  return cache[groupId] ?? empty(groupId)
}

export async function loadProject(groupId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.from('group_projects').select('*').eq('group_id', groupId).maybeSingle()
  cache = { ...cache, [groupId]: data ? mapRow(data) : empty(groupId) }
  dispatch()
}

export async function saveProject(
  groupId: string,
  patch: Partial<Omit<GroupProject, 'groupId'>>,
): Promise<void> {
  if (!supabase) return
  const current = getProject(groupId)
  const next: GroupProject = { ...current, ...patch, groupId }
  // upsert (crea el registro la primera vez, luego lo actualiza)
  await supabase.from('group_projects').upsert(
    {
      group_id: groupId,
      title: next.title,
      description: next.description,
      repo_url: next.repoUrl,
      deploy_url: next.deployUrl,
      video_url: next.videoUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'group_id' },
  )
  cache = { ...cache, [groupId]: next }
  dispatch()
  notifyBusChange(roomKey(groupId))
}

/** Realtime del proyecto de un grupo. Devuelve el unsubscribe. */
export function subscribeProject(groupId: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`gproj-${groupId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_projects' },
      (payload) => {
        const row = (payload.new ?? payload.old) as { group_id?: string } | null
        if (row?.group_id && row.group_id !== groupId) return
        loadProject(groupId)
      },
    )
    .subscribe()
  const offBus = onBusChange(roomKey(groupId), () => loadProject(groupId))
  return () => {
    sb.removeChannel(ch)
    offBus()
  }
}
