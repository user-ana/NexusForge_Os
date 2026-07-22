'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/frontend/components/auth/AuthGuard'
import Icon3D from '@/frontend/components/ui/Icon3D'
import NeoSelect from '@/frontend/components/ui/NeoSelect'
import CreateProjectModal from '@/frontend/components/projects/CreateProjectModal'
import { getSession, displayName, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { getClass, loadClasses, subscribeClasses, setProjectMode, setGroupFormation, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import {
  getGroups,
  createGroup,
  createGroupsBulk,
  updateGroup,
  deleteGroup,
  deleteGroups,
  setGroupsArchived,
  assignStudent,
  joinGroup,
  setLeader,
  setGroupProject,
  randomAssignProjects,
  groupOf,
  loadGroups,
  subscribeGroups,
  CGROUPS_EVENT,
  GROUP_ICONS,
  GROUP_COLORS,
  type ClassGroup,
} from '@/backend/services/classGroups'
import { getMessages, loadMessages, sendMessage, subscribeMessages, deleteMessage, AULACHAT_EVENT, type AulaMsg } from '@/backend/services/aulaChat'
import { getBoard, loadBoard, addTask, moveTask, deleteTask, subscribeBoard, KANBAN_EVENT, type KanCol, type KanTask } from '@/backend/services/kanban'
import { getProject as getGProject, loadProject, saveProject, subscribeProject, GPROJECT_EVENT, type GroupProject } from '@/backend/services/groupProjects'
import { getEvaluation, loadEvaluation, saveEvaluation, subscribeEvaluation, isGraded, GEVAL_EVENT, type Evaluation } from '@/backend/services/groupEvaluations'
import { fetchGithubRepo, readmeToSummary, prettifyRepoName, parseGithubRepo } from '@/backend/external/github'
import { getProjects, loadProjects, subscribeProjects, PROJECTS_EVENT, type Project } from '@/backend/services/projects'
import { joinPresence, type PresenceUser } from '@/backend/realtime/presence'
import { joinTyping, type TypingHandle } from '@/backend/realtime/typing'
import { getProfile, loadProfiles, subscribeProfiles, PROFILES_EVENT } from '@/backend/services/profiles'
import EmojiButton from '@/frontend/components/ui/EmojiButton'
import { TrashIcon, RocketIcon, GithubIcon, LinkIcon, PlayIcon, ClipboardIcon, LockIcon as LockGlyph, PencilIcon as PencilGlyph, SearchIcon } from '@/frontend/components/ui/Icons'

export default function AulaPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <Aula id={params.id} />
    </AuthGuard>
  )
}

function Aula({ id }: { id: string }) {
  const router = useRouter()
  const [klass, setKlass] = useState<Klass | undefined>(undefined)
  const [groups, setGroups] = useState<ClassGroup[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [role, setRole] = useState<Role>('student')
  const [me, setMe] = useState('')
  const [meName, setMeName] = useState('')
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  // canal activo: 'general' | 'manage' | groupId
  const [active, setActive] = useState('general')
  const [tab, setTab] = useState<'chat' | 'board' | 'project'>('chat')
  const [msgs, setMsgs] = useState<AulaMsg[]>([])
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [online, setOnline] = useState<PresenceUser[]>([])
  const [typing, setTyping] = useState<string[]>([])
  const typingRef = useRef<TypingHandle | null>(null)
  const [, setProfTick] = useState(0) // re-render cuando cambian perfiles (foto/nombre)
  const [showJump, setShowJump] = useState(false)
  const [delGroup, setDelGroup] = useState<ClassGroup | null>(null)

  // crear grupo
  const [creating, setCreating] = useState(false)
  const [gName, setGName] = useState('')
  const [gIcon, setGIcon] = useState(GROUP_ICONS[0])
  const [gColor, setGColor] = useState(GROUP_COLORS[0])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkErr, setBulkErr] = useState('')
  const [bulkN, setBulkN] = useState('') // cuántas salas crear (texto para poder borrarlo)
  const [editGroup, setEditGroup] = useState<ClassGroup | null>(null) // editar mi sala
  const [selectedIds, setSelectedIds] = useState<string[]>([]) // grupos seleccionados (lote)
  const [bulkDelete, setBulkDelete] = useState(false) // confirmar borrado en lote
  const [showArchived, setShowArchived] = useState(false)
  const [groupSearch, setGroupSearch] = useState('') // buscar grupos por nombre
  const [groupPage, setGroupPage] = useState(0) // página de la lista de grupos
  const [rosterSearch, setRosterSearch] = useState('') // buscar operadores por nombre
  const [rosterPage, setRosterPage] = useState(0) // página de la lista de operadores
  const [joinMsg, setJoinMsg] = useState('') // aviso al intentar unirse a un grupo

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const sync = () => {
      const s = getSession()
      setKlass(getClass(id))
      setGroups(getGroups(id))
      setProjects(getProjects(id))
      setRole(s?.role ?? 'student')
      setMe(s?.id ?? '')
      setMeName(displayName(s))
      setAvatar(s?.avatar)
    }
    sync()
    loadClasses().finally(() => setLoading(false))
    loadGroups(id)
    loadProjects(id)
    const unsubC = subscribeClasses()
    const unsubG = subscribeGroups(id)
    const unsubP = subscribeProjects(id)
    // refresco de respaldo: grupos y proyectos (asignaciones) en vivo entre ventanas
    const poll = setInterval(() => {
      loadGroups(id)
      loadProjects(id)
    }, 4000)
    const events = [SESSION_EVENT, CLASSES_EVENT, CGROUPS_EVENT, PROJECTS_EVENT]
    events.forEach((e) => window.addEventListener(e, sync))
    return () => {
      events.forEach((e) => window.removeEventListener(e, sync))
      clearInterval(poll)
      unsubC()
      unsubG()
      unsubP()
    }
  }, [id])

  // El campo es CUÁNTAS salas crear (no el total deseado): así lo que escribes
  // es exactamente lo que se crea. Antes se sincronizaba con el total y se
  // reseteaba solo, que es lo que hacía que el número "volviera a cero".

  // canal de chat según vista activa
  const channel = active === 'manage' ? 'general' : active
  useEffect(() => {
    const sync = () => setMsgs(getMessages(id, channel))
    sync()
    loadMessages(id, channel)
    const unsub = subscribeMessages(id, channel)
    // Respaldo: refresca cada 3s (asegura ver borrados aunque el realtime falle)
    const poll = setInterval(() => loadMessages(id, channel), 3000)
    window.addEventListener(AULACHAT_EVENT, sync)
    return () => {
      window.removeEventListener(AULACHAT_EVENT, sync)
      clearInterval(poll)
      unsub()
    }
  }, [id, channel])

  // auto-scroll al fondo cuando llegan mensajes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  // al cambiar de canal, vuelve a la pestaña de chat
  useEffect(() => setTab('chat'), [active])

  // si llega ?ch=<groupId> (desde Comunidad), abre ese canal de grupo
  const chApplied = useRef(false)
  useEffect(() => {
    if (chApplied.current || typeof window === 'undefined') return
    const ch = new URLSearchParams(window.location.search).get('ch')
    if (ch && groups.some((g) => g.id === ch)) {
      chApplied.current = true
      setActive(ch)
      window.history.replaceState(null, '', `/aula/${id}`)
    }
  }, [groups, id])

  // presencia: quién está en línea en esta aula
  useEffect(() => {
    if (!me) return
    return joinPresence(`aula-${id}`, { id: me, name: meName, role }, setOnline)
  }, [id, me, meName, role])

  // "escribiendo…" por canal
  useEffect(() => {
    if (!me) return
    const h = joinTyping(`aula-${id}-${channel}`, { id: me, name: meName }, setTyping)
    typingRef.current = h
    return () => {
      h.stop()
      typingRef.current = null
      setTyping([])
    }
  }, [id, channel, me, meName])

  // perfiles en vivo (foto/nombre): refresca el render cuando alguien los cambia
  useEffect(() => {
    const sync = () => setProfTick((t) => t + 1)
    const unsub = subscribeProfiles()
    window.addEventListener(PROFILES_EVENT, sync)
    return () => {
      window.removeEventListener(PROFILES_EVENT, sync)
      unsub()
    }
  }, [])
  useEffect(() => {
    loadProfiles(msgs.map((m) => m.author))
  }, [msgs])
  useEffect(() => {
    if (klass) loadProfiles([klass.teacher, ...klass.roster.map((r) => r.id)])
  }, [klass])

  if (!klass) {
    return (
      <div className="neo-aula-empty">
        {loading ? (
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
        ) : (
          <>
            <p className="text-neutral-400">Aula no encontrada.</p>
            <button onClick={() => router.push('/dashboard/classes')} className="neo-btn mt-4">
              ← Volver a mis clases
            </button>
          </>
        )}
      </div>
    )
  }

  // El "catedrático" del aula es el DUEÑO de esta clase (no el rol global).
  const isTeacher = !!me && klass.teacher === me
  // Es miembro si es el dueño o está inscrito.
  const isMember = isTeacher || klass.roster.some((r) => r.id === me)

  const activeGroup = groups.find((g) => g.id === active)

  // ¿puede escribir? En general: cualquier miembro. En un grupo: el dueño o sus integrantes.
  const canPost =
    active === 'general'
      ? isMember
      : activeGroup
      ? isTeacher || activeGroup.members.includes(me)
      : false

  // ¿puede VER el contenido del grupo? Solo sus integrantes o el catedrático.
  // (los demás ven que el grupo existe, pero no su chat/tablero/proyecto)
  const canViewGroup = !activeGroup || isTeacher || activeGroup.members.includes(me)

  // grupos activos (visibles) vs archivados
  const visibleGroups = groups.filter((g) => !g.archived)
  const archivedGroups = groups.filter((g) => g.archived)
  const toggleSel = (gid: string) =>
    setSelectedIds((s) => (s.includes(gid) ? s.filter((x) => x !== gid) : [...s, gid]))

  // buscador + paginado de grupos en la vista de gestión
  const GROUPS_PER_PAGE = 8
  const filteredGroups = visibleGroups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()),
  )
  const groupPageCount = Math.max(1, Math.ceil(filteredGroups.length / GROUPS_PER_PAGE))
  const gPage = Math.min(groupPage, groupPageCount - 1)
  const pagedGroups = filteredGroups.slice(gPage * GROUPS_PER_PAGE, gPage * GROUPS_PER_PAGE + GROUPS_PER_PAGE)

  // Opciones de proyecto para asignar desde la tarjeta de cada grupo (modo "el catedrático asigna").
  const projectOptions = [
    { value: '', label: 'Sin proyecto' },
    ...projects.map((p) => ({ value: p.id, label: p.title })),
  ]

  // Operadores (estudiantes) con búsqueda + paginación
  const ROSTER_PER_PAGE = 8
  const filteredRoster = klass.roster.filter((r) =>
    r.name.toLowerCase().includes(rosterSearch.trim().toLowerCase()),
  )
  const rosterPageCount = Math.max(1, Math.ceil(filteredRoster.length / ROSTER_PER_PAGE))
  const rPage = Math.min(rosterPage, rosterPageCount - 1)
  const pagedRoster = filteredRoster.slice(rPage * ROSTER_PER_PAGE, rPage * ROSTER_PER_PAGE + ROSTER_PER_PAGE)

  // Auto-inscripción: el estudiante sin grupo debe elegir escuadrón (modo "open")
  const needsToPickGroup = !isTeacher && klass.groupFormation === 'open' && !groupOf(id, me)
  async function handleJoinGroup(gid: string) {
    setJoinMsg('')
    const err = await joinGroup(id, gid)
    if (err) setJoinMsg(err)
  }

  function submit() {
    if (!draft.trim()) return
    sendMessage({ classId: id, channel, author: me, name: meName, role, avatar, text: draft })
    setDraft('')
  }

  function copyCode() {
    navigator.clipboard?.writeText(klass?.code ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function submitGroup() {
    if (!gName.trim()) return
    const g = await createGroup({ classId: id, name: gName, icon: gIcon, color: gColor })
    setGName('')
    setGIcon(GROUP_ICONS[0])
    setGColor(GROUP_COLORS[0])
    setCreating(false)
    if (g) setActive(g.id)
  }

  // opciones de grupo para el dropdown de asignación
  const groupOptions = [
    { value: '', label: 'Sin grupo / Libre' },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div className="neo-aula">
      {/* ───────── Riel de canales ───────── */}
      <aside className="neo-aula-rail">
        <div className="neo-aula-server">
          <button onClick={() => router.push('/dashboard/classes')} className="neo-aula-back" title="Salir del aula">
            ←
          </button>
          {klass.emblem && <Icon3D src={klass.emblem} alt="" size={30} fallback="◆" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{klass.name}</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-neutral-500">{klass.period}</p>
          </div>
          <span className="neo-aula-online" title="Aula activa" />
        </div>

        <div className="neo-aula-channels">
          <button
            onClick={() => setActive('general')}
            className={`neo-aula-ch ${active === 'general' ? 'neo-aula-ch--active' : ''}`}
          >
            <span className="neo-aula-hash">#</span> general
          </button>

          {isTeacher && (
            <button
              onClick={() => setActive('manage')}
              className={`neo-aula-ch ${active === 'manage' ? 'neo-aula-ch--active' : ''}`}
            >
              <GearIcon /> gestión de grupos
            </button>
          )}

          <div className="neo-aula-section">
            <span>Grupos de aula</span>
            {isTeacher && (
              <button onClick={() => setCreating(true)} className="neo-aula-add" title="Crear grupo">
                +
              </button>
            )}
          </div>

          {visibleGroups.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-neutral-600">
              {isTeacher ? 'Crea el primer escuadrón con +' : 'Aún no hay grupos'}
            </p>
          ) : (
            <div className="neo-aula-grouplist">
              {[...visibleGroups]
                .sort((a, b) => Number(b.members.includes(me)) - Number(a.members.includes(me)))
                .map((g, i) => {
                  const mine = g.members.includes(me)
                  const locked = !isTeacher && !mine
                  return (
                    <button
                      key={g.id}
                      onClick={() => setActive(g.id)}
                      className={`neo-aula-ch neo-slide-in ${active === g.id ? 'neo-aula-ch--active' : ''} ${locked ? 'opacity-60' : ''}`}
                      style={{
                        animationDelay: `${Math.min(i * 30, 360)}ms`,
                        ...(active === g.id ? { boxShadow: `inset 3px 0 0 ${g.color}` } : {}),
                      }}
                      title={locked ? 'Escuadrón privado — no eres integrante' : g.name}
                    >
                      <Icon3D src={g.icon} alt="" size={20} fallback="◆" />
                      <span className="truncate">{g.name}</span>
                      {mine ? (
                        <span className="neo-aula-you">tú</span>
                      ) : locked ? (
                        <span className="ml-auto text-neutral-600"><LockGlyph size={13} /></span>
                      ) : null}
                    </button>
                  )
                })}
            </div>
          )}
        </div>

        {/* perfil al pie */}
        <div className="neo-aula-me">
          <div className="neo-aula-avatar">
            {avatar ? (
              <Icon3D src={avatar} alt="" size={34} fallback={meName.charAt(0).toUpperCase()} />
            ) : (
              <span>{meName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-100">{meName}</p>
            <p className="text-[10px] uppercase tracking-wider text-accent-violet">
              {isTeacher ? 'Catedrático' : role === 'visitor' ? 'Visitante' : 'Operador'}
            </p>
          </div>
        </div>
      </aside>

      {/* ───────── Contenido ───────── */}
      <section className="neo-aula-main">
        <header className="neo-aula-top">
          <p className="flex items-center text-sm text-neutral-400">
            <span className="font-semibold text-white">{klass.name}</span>
            <span className="mx-2 text-neutral-700">/</span>
            <span className="inline-flex items-center gap-1.5 text-neutral-300">
              {active === 'general' ? (
                <>
                  <span className="text-neutral-500">#</span> general
                </>
              ) : active === 'manage' ? (
                <>
                  <GearIcon /> gestión de grupos
                </>
              ) : (
                activeGroup?.name ?? ''
              )}
            </span>
          </p>
          <button onClick={copyCode} className="neo-aula-copy" title="Copiar código de la clase">
            <span className="text-left leading-tight">
              <span className="block text-[9px] uppercase tracking-wider text-neutral-500">
                {copied ? 'Copiado' : 'Código de clase'}
              </span>
              <span className="block font-mono text-sm font-bold tracking-widest text-accent-violet">
                {klass.code}
              </span>
            </span>
            <span className={`neo-aula-copy-ic ${copied ? 'neo-aula-copy-ic--ok' : ''}`}>
              {copied ? <CheckMini /> : <CopyMini />}
            </span>
          </button>
        </header>

        {/* ── GESTIÓN DE GRUPOS (catedrático) ── */}
        {active === 'manage' && isTeacher ? (
          <div className="neo-aula-body">
            <div className="mx-auto w-full max-w-5xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">Gestión y asignación de grupos</h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-xl bg-black/20 px-2 py-1">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={bulkN}
                      onChange={(e) => setBulkN(e.target.value)}
                      placeholder="0"
                      className="neo-input !w-14 !py-1 text-center text-sm"
                      title="Cuántas salas crear"
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={async () => {
                        const n = Math.max(0, Math.min(60, parseInt(bulkN, 10) || 0))
                        if (n < 1) { setBulkErr('Escribe cuántas salas crear.'); return }
                        setBulkBusy(true); setBulkErr('')
                        const err = await createGroupsBulk(id, n)
                        setBulkBusy(false)
                        if (err) setBulkErr(err)
                        else setBulkN('')
                      }}
                      disabled={bulkBusy}
                      className="neo-btn-ghost whitespace-nowrap text-sm"
                      title="Crea esa cantidad de salas"
                    >
                      {bulkBusy ? 'Creando…' : 'Crear salas'}
                    </button>
                  </div>
                  <button onClick={() => setCreating(true)} className="neo-btn text-sm">+ Nuevo grupo</button>
                </div>
              </div>
              {bulkErr && <p className="-mt-3 text-xs text-amber-400">{bulkErr}</p>}

              {/* Formación de grupos: quién forma los equipos + cupo */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
                <span className="neo-label flex-shrink-0">Formación de grupos</span>
                <div className="w-64">
                  <NeoSelect
                    value={klass.groupFormation}
                    onChange={(v) => setGroupFormation(id, v as 'assigned' | 'open', klass.maxTeamSize)}
                    options={[
                      { value: 'assigned', label: 'El catedrático asigna' },
                      { value: 'open', label: 'Auto-inscripción (los alumnos eligen)' },
                    ]}
                  />
                </div>
                {klass.groupFormation === 'open' && (
                  <label className="flex items-center gap-2 text-xs text-neutral-400">
                    Cupo por grupo
                    <input
                      type="number"
                      min={1}
                      max={20}
                      key={klass.maxTeamSize}
                      defaultValue={klass.maxTeamSize}
                      onBlur={(e) => setGroupFormation(id, 'open', Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="neo-input !w-16 !py-1 text-center text-sm"
                    />
                  </label>
                )}
                <span className="text-xs text-neutral-500">
                  {klass.groupFormation === 'open'
                    ? 'Los estudiantes eligen su grupo y quedan bloqueados al unirse.'
                    : 'Tú decides en qué grupo va cada estudiante.'}
                </span>
              </div>

              {/* Barra de acciones en lote (aparece al seleccionar) */}
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-violet/30 bg-accent-violet/10 px-4 py-2.5">
                  <span className="text-sm font-medium text-neutral-100">
                    {selectedIds.length} seleccionada{selectedIds.length > 1 ? 's' : ''}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => { setGroupsArchived(id, selectedIds, true); setSelectedIds([]) }}
                      className="neo-btn-ghost text-sm"
                    >
                      Archivar
                    </button>
                    <button
                      onClick={() => setBulkDelete(true)}
                      className="neo-btn-ghost text-sm text-red-400 hover:!text-red-300"
                    >
                      Eliminar
                    </button>
                    <button onClick={() => setSelectedIds([])} className="neo-btn-ghost text-sm">
                      Limpiar
                    </button>
                  </div>
                </div>
              )}

              {/* buscador de grupos */}
              {visibleGroups.length > 0 && (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"><SearchIcon size={16} /></span>
                  <input
                    value={groupSearch}
                    onChange={(e) => { setGroupSearch(e.target.value); setGroupPage(0) }}
                    placeholder="Buscar sala por nombre…"
                    className="neo-input w-full !py-2 !pl-9 text-sm"
                  />
                </div>
              )}

              {/* grupos paginados — tarjetas amplias, sin scroll */}
              {filteredGroups.length === 0 ? (
                <p className="rounded-xl bg-black/20 px-4 py-3 text-sm text-neutral-500">
                  {groupSearch ? 'Ninguna sala coincide con la búsqueda.' : 'Aún no hay salas.'}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {pagedGroups.map((g, i) => {
                      const sel = selectedIds.includes(g.id)
                      const assignedProj = projects.find((p) => p.id === g.projectId)
                      return (
                        <div
                          key={g.id}
                          className={`neo-aula-gcard neo-card-in group relative flex flex-col gap-3 !p-4 ${sel ? 'ring-2 ring-accent-violet' : ''}`}
                          style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
                        >
                          <div className="flex w-full items-center gap-3">
                            <button
                              onClick={() => toggleSel(g.id)}
                              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition ${sel ? 'border-accent-violet bg-accent-violet text-white' : 'border-white/15 text-transparent hover:border-white/40'}`}
                              title="Seleccionar"
                            >
                              <CheckMini />
                            </button>
                            <span className="h-11 w-1.5 flex-shrink-0 rounded-full" style={{ background: g.color }} />
                            <Icon3D src={g.icon} alt="" size={34} fallback="◆" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-white">{g.name}</p>
                              <p className="text-[11px] text-neutral-500">{g.members.length} integrantes</p>
                            </div>
                            <button
                              onClick={() => setDelGroup(g)}
                              className="flex-shrink-0 text-neutral-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                              title="Eliminar grupo"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Asignación de proyecto (solo catedrático) */}
                          {isTeacher && klass.projectMode === 'assigned' && (
                            <NeoSelect
                              value={g.projectId ?? ''}
                              onChange={(v) => setGroupProject(id, g.id, v || null)}
                              options={projectOptions}
                            />
                          )}
                          {isTeacher && klass.projectMode === 'catalog' && (
                            <span
                              className="self-start truncate rounded-md px-2 py-1 text-xs"
                              style={{
                                background: assignedProj ? `${g.color}22` : 'rgba(255,255,255,0.04)',
                                color: assignedProj ? '#e5e7eb' : '#9ca3af',
                              }}
                            >
                              {assignedProj ? assignedProj.title : 'Sin elegir'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* controles de paginación */}
                  {groupPageCount > 1 && (
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setGroupPage((p) => Math.max(0, p - 1))}
                        disabled={gPage === 0}
                        className="neo-btn-ghost !px-2.5 text-sm disabled:opacity-40"
                        title="Anterior"
                      >
                        ‹
                      </button>
                      {Array.from({ length: groupPageCount }, (_, n) => (
                        <button
                          key={n}
                          onClick={() => setGroupPage(n)}
                          className={`h-8 w-8 rounded-lg text-sm transition ${n === gPage ? 'bg-accent-violet text-white' : 'text-neutral-400 hover:bg-white/5'}`}
                        >
                          {n + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setGroupPage((p) => Math.min(groupPageCount - 1, p + 1))}
                        disabled={gPage === groupPageCount - 1}
                        className="neo-btn-ghost !px-2.5 text-sm disabled:opacity-40"
                        title="Siguiente"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Salas archivadas */}
              {archivedGroups.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowArchived((v) => !v)}
                    className="neo-label flex items-center gap-1.5 hover:text-neutral-300"
                  >
                    Archivadas ({archivedGroups.length}) {showArchived ? '▲' : '▼'}
                  </button>
                  {showArchived && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {archivedGroups.map((g) => (
                        <div key={g.id} className="neo-aula-gcard flex items-center gap-2.5 opacity-70">
                          <Icon3D src={g.icon} alt="" size={24} fallback="◆" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-neutral-300">{g.name}</p>
                            <p className="text-[11px] text-neutral-600">{g.members.length} integrantes</p>
                          </div>
                          <button
                            onClick={() => setGroupsArchived(id, [g.id], false)}
                            className="flex-shrink-0 text-xs text-accent-violet hover:text-accent-violetBright"
                            title="Desarchivar"
                          >
                            Desarchivar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modalidad de proyecto + asignación */}
              <TeacherProjectPanel classId={id} mode={klass.projectMode} projects={projects} groups={visibleGroups} />

              {/* lista de estudiantes con su dropdown de grupo */}
              <div className="neo-panel p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="neo-label">Operadores en el aula</span>
                  <div className="flex items-center gap-3">
                    {klass.roster.length > ROSTER_PER_PAGE && (
                      <input
                        value={rosterSearch}
                        onChange={(e) => { setRosterSearch(e.target.value); setRosterPage(0) }}
                        placeholder="Buscar operador…"
                        className="neo-input h-8 w-44 text-sm"
                      />
                    )}
                    <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                      Total: {klass.roster.length}
                    </span>
                  </div>
                </div>
                {klass.roster.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    Aún no hay estudiantes inscritos. Comparte el código{' '}
                    <span className="font-mono text-accent-violet">{klass.code}</span>.
                  </p>
                ) : filteredRoster.length === 0 ? (
                  <p className="text-sm text-neutral-500">Ningún operador coincide con la búsqueda.</p>
                ) : (
                  <div className="space-y-2.5">
                    {pagedRoster.map((st, i) => {
                      const g = groupOf(id, st.id)
                      return (
                        <div
                          key={st.id}
                          className="neo-aula-row neo-card-in"
                          style={{ animationDelay: `${Math.min(i * 45, 320)}ms` }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="neo-aula-mini">{st.name.charAt(0).toUpperCase()}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-neutral-100">{st.name}</p>
                              {g && (
                                <p className="text-[11px]" style={{ color: g.color }}>
                                  {g.name}
                                  {g.leader === st.id && ' · líder'}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {g && (
                              <button
                                onClick={() => setLeader(g.id, st.id)}
                                className={`neo-aula-leadbtn ${g.leader === st.id ? 'neo-aula-leadbtn--on' : ''}`}
                                title="Marcar como líder"
                              >
                                ★
                              </button>
                            )}
                            <div className="w-44">
                              <NeoSelect
                                value={g?.id ?? ''}
                                onChange={(v) => assignStudent(id, st.id, v || null)}
                                options={groupOptions}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {rosterPageCount > 1 && (
                      <div className="flex items-center justify-center gap-1.5 pt-1">
                        <button onClick={() => setRosterPage((p) => Math.max(0, p - 1))} disabled={rPage === 0} className="neo-btn-ghost !px-2.5 text-sm disabled:opacity-40" title="Anterior">‹</button>
                        {Array.from({ length: rosterPageCount }, (_, n) => (
                          <button key={n} onClick={() => setRosterPage(n)} className={`h-8 w-8 rounded-lg text-sm transition ${n === rPage ? 'bg-accent-violet text-white' : 'text-neutral-400 hover:bg-white/5'}`}>{n + 1}</button>
                        ))}
                        <button onClick={() => setRosterPage((p) => Math.min(rosterPageCount - 1, p + 1))} disabled={rPage === rosterPageCount - 1} className="neo-btn-ghost !px-2.5 text-sm disabled:opacity-40" title="Siguiente">›</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── CANAL DE CHAT / TABLERO (general o grupo) ── */
          <>
            {/* Pestañas Chat / Tablero (solo en canal de grupo del que eres integrante) */}
            {activeGroup && canViewGroup && (
              <div className="neo-aula-tabs">
                <button
                  onClick={() => setTab('chat')}
                  className={`neo-aula-tab ${tab === 'chat' ? 'neo-aula-tab--active' : ''}`}
                >
                  <ChatIcon /> Chat
                </button>
                <button
                  onClick={() => setTab('board')}
                  className={`neo-aula-tab ${tab === 'board' ? 'neo-aula-tab--active' : ''}`}
                >
                  <BoardIcon /> Tablero
                </button>
                <button
                  onClick={() => setTab('project')}
                  className={`neo-aula-tab ${tab === 'project' ? 'neo-aula-tab--active' : ''}`}
                >
                  <RocketIcon size={15} /> Proyecto
                </button>
              </div>
            )}

            {active === 'general' && needsToPickGroup ? (
              /* ── AUTO-INSCRIPCIÓN: el estudiante elige su escuadrón ── */
              <div className="neo-aula-body neo-aula-scroll">
                <div className="mx-auto w-full max-w-[1500px] space-y-7 px-2 py-8">
                  <div className="neo-squad-title text-center">
                    <h3 className="text-3xl font-extrabold tracking-tight text-white">Elige tu escuadrón</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-400">
                      Únete a un grupo para trabajar. Al unirte quedas fijo — si necesitas cambiar, pídelo al catedrático.
                    </p>
                  </div>
                  {joinMsg && (
                    <p className="mx-auto max-w-md rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">{joinMsg}</p>
                  )}
                  {visibleGroups.length === 0 ? (
                    <p className="text-center text-sm text-neutral-500">Aún no hay grupos. Espera a que el catedrático los cree.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {visibleGroups.map((g, gi) => {
                        const full = g.members.length >= klass.maxTeamSize
                        return (
                          <div
                            key={g.id}
                            className="neo-squad-card group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-5 text-center transition duration-200 hover:-translate-y-1.5"
                            style={{ animationDelay: `${Math.min(gi * 55, 620)}ms`, boxShadow: `0 14px 36px -16px ${g.color}88` }}
                          >
                            <span className="absolute inset-x-0 top-0 h-1" style={{ background: g.color }} />
                            <div className="relative mt-1">
                              <span
                                className="neo-squad-glow absolute -inset-3 rounded-full blur-xl"
                                style={{ background: g.color }}
                              />
                              <Icon3D src={g.icon} alt="" size={56} fallback="◆" />
                            </div>
                            <p className="text-base font-bold text-white">{g.name}</p>
                            <div className="flex items-center justify-center gap-1">
                              {Array.from({ length: klass.maxTeamSize }).map((_, k) => (
                                <span
                                  key={k}
                                  className="h-1.5 w-4 rounded-full"
                                  style={{ background: k < g.members.length ? g.color : 'rgba(255,255,255,0.12)' }}
                                />
                              ))}
                            </div>
                            <p className="text-[11px] text-neutral-500">{g.members.length}/{klass.maxTeamSize} integrantes</p>
                            <button
                              onClick={() => handleJoinGroup(g.id)}
                              disabled={full}
                              className="mt-1 w-full rounded-xl py-2.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                              style={{ background: full ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${g.color}, ${g.color}bb)` }}
                            >
                              {full ? 'LLENO' : 'Unirme'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : activeGroup && !canViewGroup ? (
              /* ── ESCUADRÓN PRIVADO: no eres integrante ── */
              <div className="neo-aula-body neo-aula-scroll">
                <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-16 text-center text-neutral-500">
                  <LockGlyph size={30} />
                  <h3 className="text-base font-semibold text-neutral-300">Escuadrón privado</h3>
                  <p className="text-sm">
                    No eres integrante de <span className="font-medium text-neutral-300">{activeGroup.name}</span>. Su chat, tablero y proyecto solo los ven sus integrantes.
                  </p>
                </div>
              </div>
            ) : activeGroup && tab === 'board' ? (
              /* ── TABLERO KANBAN del escuadrón ── */
              <GroupBoard group={activeGroup} canEdit={activeGroup.members.includes(me)} />
            ) : activeGroup && tab === 'project' ? (
              /* ── PROYECTO (showcase) del escuadrón ── */
              <GroupProjectPanel
                group={activeGroup}
                canEdit={activeGroup.members.includes(me)}
                isTeacher={isTeacher}
                mode={klass.projectMode}
                projects={projects}
              />
            ) : (
              <>
                <div
                  ref={scrollRef}
                  onScroll={(e) => {
                    const el = e.currentTarget
                    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 220)
                  }}
                  className="neo-aula-body neo-aula-scroll"
                >
                  <div className="mx-auto w-full max-w-3xl">
                    {/* Bienvenida / cabecera del canal */}
                    {active === 'general' ? (
                      <WelcomeHero
                        klass={klass}
                        meName={meName}
                        isTeacher={isTeacher}
                        members={klass.students.length}
                        groupsCount={groups.length}
                      />
                    ) : activeGroup ? (
                      <GroupHero
                        group={activeGroup}
                        mine={activeGroup.members.includes(me)}
                        roster={klass.roster}
                        onEdit={() => setEditGroup(activeGroup)}
                      />
                    ) : null}

                    {/* Mensajes */}
                    <div className="mt-6 space-y-1">
                      {msgs.length === 0 ? (
                        <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-neutral-600">
                          No hay mensajes todavía. ¡Rompe el hielo! <WaveIcon />
                        </p>
                      ) : (
                        msgs.map((m, i) => {
                          const prev = msgs[i - 1]
                          const grouped = prev && prev.author === m.author && m.ts - prev.ts < 5 * 60 * 1000
                          return (
                            <ChatLine
                              key={m.id}
                              m={m}
                              grouped={!!grouped}
                              mine={m.author === me}
                              onDelete={() => deleteMessage(m.id)}
                            />
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                {showJump && (
                  <button
                    onClick={() => {
                      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
                      setShowJump(false)
                    }}
                    className="neo-chat-jump"
                  >
                    ↓ Ir al final
                  </button>
                )}

                {/* Composer */}
                <div className="neo-aula-composer">
                  {typing.length > 0 && (
                    <p className="neo-typing">
                      <span className="neo-typing-dots"><span /><span /><span /></span>
                      {typing.join(', ')} {typing.length === 1 ? 'está' : 'están'} escribiendo…
                    </p>
                  )}
                  {canPost ? (
                    <div className="relative">
                      <div className="neo-aula-input">
                        <EmojiButton onPick={(e) => setDraft((d) => d + e)} className="neo-aula-emojitoggle" />
                        <input
                          value={draft}
                          onChange={(e) => { setDraft(e.target.value); typingRef.current?.notify() }}
                          onKeyDown={(e) => e.key === 'Enter' && submit()}
                          placeholder={
                            active === 'general'
                              ? 'Mensaje para # general…'
                              : `Mensaje para ${activeGroup?.name ?? 'el grupo'}…`
                          }
                          className="neo-aula-field"
                        />
                        <button onClick={submit} className="neo-aula-send" disabled={!draft.trim()} title="Enviar">
                          <SendIcon />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="neo-aula-locked">
                      <LockIcon />{' '}
                      {active === 'general'
                        ? 'No perteneces a esta aula. Únete con el código de la clase.'
                        : 'Solo los integrantes de este grupo pueden escribir aquí.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ───────── Miembros / en línea ───────── */}
      {active !== 'manage' && (
        <AulaMembers
          group={activeGroup}
          klass={klass}
          online={online}
          me={me}
        />
      )}

      {/* ── Modal confirmar eliminar grupo ── */}
      {delGroup && mounted &&
        createPortal(
          <div className="neo-modal-backdrop" onClick={() => setDelGroup(null)}>
            <div className="neo-modal space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                <TrashIcon size={22} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">¿Eliminar el escuadrón?</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Se eliminará <span className="font-semibold text-white">{delGroup.name}</span>
                  {delGroup.members.length > 0 ? (
                    <>
                      {' '}y sus <span className="text-red-400">{delGroup.members.length} integrantes</span> quedarán sin
                      grupo. El chat y el tablero del grupo se perderán.
                    </>
                  ) : (
                    <> (no tiene integrantes).</>
                  )}{' '}
                  Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDelGroup(null)} className="neo-btn-ghost flex-1 justify-center">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteGroup(delGroup.id)
                    if (active === delGroup.id) setActive('general')
                    setDelGroup(null)
                  }}
                  className="neo-btn flex-1 justify-center !bg-red-500/90 hover:!bg-red-500"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Modal crear grupo ── */}
      {isTeacher && creating && mounted &&
        createPortal(
          <div className="neo-modal-backdrop" onClick={() => setCreating(false)}>
            <div className="neo-modal neo-group-modal" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setCreating(false)} className="neo-group-close" title="Cerrar">✕</button>

              {/* Preview en vivo del escuadrón */}
              <div
                className="neo-group-hero"
                style={{ background: `radial-gradient(circle at 50% 0%, ${gColor}22, transparent 72%)` }}
              >
                <div
                  className="neo-group-hero-emblem"
                  style={{ boxShadow: `0 0 0 1px ${gColor}3a, 0 10px 30px ${gColor}24, inset 0 0 26px ${gColor}14` }}
                >
                  <Icon3D src={gIcon} alt="" size={68} fallback="◆" />
                </div>
                <p className="neo-group-hero-name">{gName.trim() || 'Escuadrón Kernel'}</p>
                <p className="neo-group-hero-channel">
                  <span style={{ color: gColor }}>#</span>{' '}
                  {(gName.trim() || 'escuadrón').toLowerCase().replace(/\s+/g, '-')}
                  <span className="mx-1.5 text-neutral-700">·</span> canal del escuadrón
                </p>
              </div>

              <div className="neo-group-body">
                <div className="space-y-1.5">
                  <label className="neo-label">Nombre del grupo</label>
                  <input
                    value={gName}
                    onChange={(e) => setGName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitGroup()}
                    placeholder="Escuadrón Kernel"
                    className="neo-input w-full"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="neo-label">Emblema</label>
                  <div className="neo-group-emblems">
                    {GROUP_ICONS.map((ic) => (
                      <button
                        key={ic}
                        onClick={() => setGIcon(ic)}
                        className={`neo-emblem-opt ${gIcon === ic ? 'neo-emblem-opt--active' : ''}`}
                      >
                        <Icon3D src={ic} alt="" size={38} fallback="◆" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="neo-label">Color del canal</label>
                  <div className="flex flex-wrap gap-2.5">
                    {GROUP_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setGColor(c)}
                        className={`neo-aula-color ${gColor === c ? 'neo-aula-color--active' : ''}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                <button onClick={submitGroup} className="neo-btn neo-group-cta w-full justify-center">
                  Crear escuadrón
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Modal editar/personalizar sala (integrantes o catedrático) ── */}
      {editGroup && mounted && (
        <EditGroupModal group={editGroup} classId={id} me={me} isTeacher={isTeacher} groups={groups} onClose={() => setEditGroup(null)} />
      )}

      {/* ── Modal confirmar borrado en lote ── */}
      {bulkDelete && mounted &&
        createPortal(
          <div className="neo-modal-backdrop" onClick={() => setBulkDelete(false)}>
            <div className="neo-modal space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                <TrashIcon size={22} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  ¿Eliminar {selectedIds.length} sala{selectedIds.length > 1 ? 's' : ''}?
                </h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Se eliminarán con su chat, tablero y proyecto. Sus integrantes quedarán sin grupo. Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setBulkDelete(false)} className="neo-btn-ghost flex-1 justify-center">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteGroups(id, selectedIds)
                    if (selectedIds.includes(active)) setActive('general')
                    setSelectedIds([])
                    setBulkDelete(false)
                  }}
                  className="neo-btn flex-1 justify-center !bg-red-500/90 hover:!bg-red-500"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/* ───────── Subcomponentes ───────── */

function WelcomeHero({
  klass,
  meName,
  isTeacher,
  members,
  groupsCount,
}: {
  klass: Klass
  meName: string
  isTeacher: boolean
  members: number
  groupsCount: number
}) {
  return (
    <div className="neo-aula-welcome">
      {klass.emblem && (
        <div className="neo-aula-welcome-emblem">
          <Icon3D src={klass.emblem} alt="" size={64} fallback="◆" />
        </div>
      )}
      <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-white">
        Bienvenido{isTeacher ? ' de nuevo' : ''}, {meName.split(' ')[0]}
        <WaveIcon />
      </h1>
      <p className="mt-1 max-w-md text-sm text-neutral-400">
        {isTeacher
          ? `Este es el aula de ${klass.name}. Crea grupos, asígnalos y coordina a tus operadores desde aquí.`
          : `Estás en el aula de ${klass.name}. Este es el canal general de la clase — preséntate y coordina con tu escuadrón.`}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <span className="neo-aula-stat"><UsersIcon /> {members} operadores</span>
        <span className="neo-aula-stat"><LayersIcon /> {groupsCount} grupos</span>
        <span className="neo-aula-stat"><TagIcon /> {klass.period}</span>
      </div>
    </div>
  )
}

/** Modal para que un integrante (o el catedrático) personalice su sala.
    El NOMBRE solo lo cambia el líder (o el catedrático) y no puede repetirse. */
function EditGroupModal({
  group, classId, me, isTeacher, groups, onClose,
}: {
  group: ClassGroup
  classId: string
  me: string
  isTeacher: boolean
  groups: ClassGroup[]
  onClose: () => void
}) {
  const [name, setName] = useState(group.name)
  const [icon, setIcon] = useState(group.icon)
  const [color, setColor] = useState(group.color)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const canRename = isTeacher || group.leader === me
  // Nombres de las OTRAS salas de la clase (para avisar de duplicados)
  const otherNames = groups
    .filter((g) => g.id !== group.id)
    .map((g) => g.name.trim().toLowerCase())
  const trimmed = name.trim()
  const nameChanged = trimmed.toLowerCase() !== group.name.trim().toLowerCase()
  const dup = nameChanged && otherNames.includes(trimmed.toLowerCase())

  async function save() {
    if (!trimmed) { setErr('La sala necesita un nombre.'); return }
    if (dup) { setErr('Ya existe una sala con ese nombre en la clase.'); return }
    setSaving(true)
    setErr('')
    // Si no puede renombrar, no mandamos el nombre (conserva el actual).
    const e = await updateGroup(classId, group.id, {
      name: canRename ? name : undefined,
      icon,
      color,
    })
    setSaving(false)
    if (e) { setErr(e); return }
    onClose()
  }

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onClose}>
      <div className="neo-modal neo-group-modal" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="neo-group-close" title="Cerrar">✕</button>
        <div className="neo-group-hero" style={{ background: `radial-gradient(circle at 50% 0%, ${color}22, transparent 72%)` }}>
          <div className="neo-group-hero-emblem" style={{ boxShadow: `0 0 0 1px ${color}3a, 0 10px 30px ${color}24, inset 0 0 26px ${color}14` }}>
            <Icon3D src={icon} alt="" size={68} fallback="◆" />
          </div>
          <p className="neo-group-hero-name">{name.trim() || 'Sala'}</p>
        </div>
        <div className="neo-group-body">
          <div className="space-y-1.5">
            <label className="neo-label">Nombre de la sala</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Ej. el nombre de su proyecto"
              className={`neo-input w-full ${dup ? '!border-amber-500/60' : ''}`}
              autoFocus={canRename}
              disabled={!canRename}
              maxLength={40}
            />
            {!canRename && (
              <p className="text-xs text-neutral-500">Solo el líder de la sala puede cambiar el nombre. Tú sí puedes cambiar el emblema y el color.</p>
            )}
            {canRename && dup && (
              <p className="text-xs text-amber-400">Ya existe una sala con ese nombre en la clase.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="neo-label">Emblema</label>
            <div className="neo-group-emblems">
              {GROUP_ICONS.map((ic) => (
                <button key={ic} onClick={() => setIcon(ic)} className={`neo-emblem-opt ${icon === ic ? 'neo-emblem-opt--active' : ''}`}>
                  <Icon3D src={ic} alt="" size={38} fallback="◆" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="neo-label">Color del canal</label>
            <div className="flex flex-wrap gap-2.5">
              {GROUP_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`neo-aula-color ${color === c ? 'neo-aula-color--active' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          {err && !dup && <p className="text-xs text-amber-400">{err}</p>}
          <button onClick={save} disabled={saving || (canRename && dup)} className="neo-btn neo-group-cta w-full justify-center">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function GroupHero({
  group,
  mine,
  roster,
  onEdit,
}: {
  group: ClassGroup
  mine: boolean
  roster: { id: string; name: string }[]
  onEdit?: () => void
}) {
  const nameOf = (uid: string) => roster.find((r) => r.id === uid)?.name ?? 'Estudiante'
  return (
    <div className="neo-aula-welcome" style={{ borderColor: `${group.color}44` }}>
      <div className="neo-aula-welcome-emblem">
        <Icon3D src={group.icon} alt="" size={60} fallback="◆" />
      </div>
      <h1 className="text-2xl font-bold text-white">{group.name}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {group.members.length} integrantes{mine ? ' · eres parte de este escuadrón' : ''}
      </p>
      {mine && onEdit && (
        <button onClick={onEdit} className="neo-btn-ghost mt-3 inline-flex items-center gap-1.5 text-xs">
          <PencilGlyph size={13} /> Personalizar sala
        </button>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {group.members.length === 0 ? (
          <span className="neo-aula-stat text-neutral-500">Sin integrantes aún</span>
        ) : (
          group.members.map((m) => (
            <span key={m} className="neo-aula-stat" style={group.leader === m ? { color: group.color } : undefined}>
              {group.leader === m ? '★ ' : ''}
              {nameOf(m)}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function AulaMembers({
  group,
  klass,
  online,
  me,
}: {
  group?: ClassGroup
  klass: Klass
  online: PresenceUser[]
  me: string
}) {
  const onlineIds = new Set(online.map((o) => o.id))
  const nameOf = (id: string, fallback: string) => getProfile(id)?.name ?? fallback
  const list: { id: string; name: string; teacher?: boolean }[] = group
    ? group.members.map((uid) => ({ id: uid, name: nameOf(uid, klass.roster.find((r) => r.id === uid)?.name ?? 'Estudiante') }))
    : [
        { id: klass.teacher, name: nameOf(klass.teacher, klass.teacherName ?? 'Catedrático'), teacher: true },
        ...klass.roster.map((r) => ({ id: r.id, name: nameOf(r.id, r.name) })),
      ]
  const onlineCount = list.filter((m) => onlineIds.has(m.id)).length
  return (
    <aside className="neo-aula-members">
      <p className="neo-label px-1">{group ? 'Escuadrón' : 'En el aula'} · {list.length}</p>
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">En línea · {onlineCount}</p>
      <div className="mt-2 space-y-0.5">
        {list.map((m) => {
          const on = onlineIds.has(m.id)
          const av = getProfile(m.id)?.avatar
          return (
            <div key={m.id} className={`neo-aula-member ${on ? '' : 'neo-aula-member--off'}`}>
              <span className="neo-aula-member-av">
                {av ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={av} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  m.name.charAt(0).toUpperCase()
                )}
                <span className={`neo-aula-mdot ${on ? 'neo-aula-mdot--on' : ''}`} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-200">
                  {m.name}
                  {m.id === me ? ' (tú)' : ''}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {m.teacher ? 'Catedrático' : 'Operador'}
                  {on ? ' · en línea' : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

const PROJECT_MODE_LABELS: Record<string, string> = {
  assigned: 'El catedrático asigna',
  catalog: 'Los estudiantes eligen de la lista',
  proposal: 'Los estudiantes crean el suyo',
  mixed: 'Mixto: elegir o proponer',
}
const PROJECT_MODE_HELP: Record<string, string> = {
  assigned: 'Tú decides qué proyecto trabaja cada grupo (manualmente o al azar).',
  catalog: 'Cada grupo elige uno de los proyectos que publicaste en la clase.',
  proposal: 'Cada grupo propone y define su propio proyecto en su pestaña Proyecto.',
  mixed: 'Cada grupo elige uno de tus proyectos O propone el suyo, desde su pestaña Proyecto.',
}

/** Panel del catedrático: modalidad de selección de proyecto + asignación por grupo. */
function TeacherProjectPanel({
  classId,
  mode,
  projects,
  groups,
}: {
  classId: string
  mode: string
  projects: Project[]
  groups: ClassGroup[]
}) {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="neo-panel space-y-4 p-5">
      <CreateProjectModal classId={classId} open={showCreate} onClose={() => setShowCreate(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="neo-label">Selección de proyecto</span>
        <div className="flex items-center gap-2">
          {mode !== 'proposal' && (
            <button onClick={() => setShowCreate(true)} className="neo-btn text-sm">+ Proyecto</button>
          )}
          <div className="w-60">
            <NeoSelect
              value={mode}
              onChange={(v) => setProjectMode(classId, v as 'assigned' | 'catalog' | 'proposal' | 'mixed')}
              options={[
                { value: 'assigned', label: PROJECT_MODE_LABELS.assigned },
                { value: 'catalog', label: PROJECT_MODE_LABELS.catalog },
                { value: 'proposal', label: PROJECT_MODE_LABELS.proposal },
                { value: 'mixed', label: PROJECT_MODE_LABELS.mixed },
              ]}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-neutral-500">{PROJECT_MODE_HELP[mode] ?? ''}</p>

      {mode === 'proposal' ? (
        <p className="rounded-xl bg-black/20 px-4 py-3 text-xs text-neutral-400">
          En esta modalidad cada grupo define su propio proyecto desde su pestaña <span className="text-neutral-200">Proyecto</span>.
        </p>
      ) : projects.length === 0 && mode !== 'mixed' ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-black/20 px-4 py-3">
          <p className="text-xs text-neutral-400">
            Aún no hay proyectos en la clase. Créalos primero para poder asignarlos a los grupos.
          </p>
          <button onClick={() => setShowCreate(true)} className="neo-btn text-sm">
            + Crear proyecto
          </button>
        </div>
      ) : mode === 'assigned' ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => randomAssignProjects(classId, projects.map((p) => p.id))}
            disabled={groups.length === 0}
            className="neo-btn text-sm"
          >
            Repartir al azar
          </button>
          <p className="text-xs text-neutral-500">
            Asigna el proyecto de cada grupo en sus tarjetas, arriba.
          </p>
        </div>
      ) : (
        <p className="rounded-xl bg-black/20 px-4 py-3 text-xs text-neutral-400">
          {mode === 'mixed'
            ? 'Cada grupo elige uno de tus proyectos O propone el suyo, desde su pestaña Proyecto. Verás lo elegido en cada tarjeta, arriba.'
            : 'Los grupos eligen su proyecto del catálogo desde su pestaña Proyecto. Verás lo elegido en cada tarjeta, arriba.'}
        </p>
      )}
    </div>
  )
}

/** Normaliza una URL para el href (agrega https:// si falta protocolo). */
function safeHref(url: string): string {
  const u = url.trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function GroupProjectPanel({
  group,
  canEdit,
  isTeacher,
  mode,
  projects,
}: {
  group: ClassGroup
  canEdit: boolean
  isTeacher: boolean
  mode: string
  projects: Project[]
}) {
  const [proj, setProj] = useState<GroupProject>(getGProject(group.id))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<GroupProject>(proj)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const sync = () => setProj(getGProject(group.id))
    sync()
    loadProject(group.id)
    const unsub = subscribeProject(group.id)
    const poll = setInterval(() => loadProject(group.id), 4000)
    window.addEventListener(GPROJECT_EVENT, sync)
    return () => {
      window.removeEventListener(GPROJECT_EVENT, sync)
      clearInterval(poll)
      unsub()
    }
  }, [group.id])

  // refresca el borrador con el dato remoto mientras no estés editando
  useEffect(() => {
    if (!editing) setDraft(proj)
  }, [proj, editing])

  async function save() {
    setSaving(true)
    await saveProject(group.id, {
      title: draft.title.trim(),
      description: draft.description.trim(),
      repoUrl: draft.repoUrl.trim(),
      deployUrl: draft.deployUrl.trim(),
      videoUrl: draft.videoUrl.trim(),
    })
    setSaving(false)
    setEditing(false)
  }

  // Con solo el enlace del repo, jala nombre + README + homepage de GitHub y
  // rellena lo que esté vacío (no pisa lo que el equipo ya escribió).
  async function importFromGithub() {
    if (!parseGithubRepo(draft.repoUrl)) {
      setImportMsg({ ok: false, text: 'Pega primero un enlace válido de GitHub (github.com/usuario/repositorio).' })
      return
    }
    setImporting(true)
    setImportMsg(null)
    try {
      const info = await fetchGithubRepo(draft.repoUrl)
      if (!info) {
        setImportMsg({ ok: false, text: 'No se pudo leer el repositorio. ¿Es público y el enlace es correcto?' })
        return
      }
      const summary = info.readme ? readmeToSummary(info.readme) : ''
      setDraft((d) => ({
        ...d,
        title: d.title.trim() || prettifyRepoName(info.name),
        description: d.description.trim() || summary || info.description,
        deployUrl: d.deployUrl.trim() || info.homepage,
      }))
      setImportMsg({ ok: true, text: 'Datos cargados desde GitHub. Revisa y ajusta antes de guardar.' })
    } catch {
      setImportMsg({ ok: false, text: 'Error al conectar con GitHub. Intenta de nuevo.' })
    } finally {
      setImporting(false)
    }
  }

  const links = [
    { key: 'repo', label: 'Repositorio (GitHub)', url: proj.repoUrl, icon: <GithubIcon size={18} /> },
    { key: 'deploy', label: 'Despliegue', url: proj.deployUrl, icon: <LinkIcon size={18} /> },
    { key: 'video', label: 'Video demostrativo', url: proj.videoUrl, icon: <PlayIcon size={18} /> },
  ].filter((l) => l.url.trim())

  const hasAny = proj.title.trim() || proj.description.trim() || links.length > 0
  const assigned = projects.find((p) => p.id === group.projectId)

  if (editing) {
    return (
      <div className="neo-aula-body neo-aula-scroll">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <RocketIcon size={18} /> Editar proyecto del equipo
          </h3>

          <div>
            <p className="neo-label mb-1.5">Título del proyecto</p>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ej. Sistema de riego inteligente" className="neo-input w-full" maxLength={120} />
          </div>

          <div>
            <p className="neo-label mb-1.5">Descripción</p>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="¿Qué construyeron? Tecnologías, alcance, resultados…" className="neo-input w-full min-h-[110px] resize-y" maxLength={1000} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="neo-label">Repositorio de GitHub</p>
              <button
                type="button"
                onClick={importFromGithub}
                disabled={importing || !draft.repoUrl.trim()}
                className="neo-btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
              >
                <GithubIcon size={14} /> {importing ? 'Importando…' : 'Importar desde GitHub'}
              </button>
            </div>
            <input value={draft.repoUrl} onChange={(e) => { setDraft({ ...draft, repoUrl: e.target.value }); setImportMsg(null) }} placeholder="https://github.com/usuario/repositorio" className="neo-input w-full" />
            {importMsg && (
              <p className={`mt-1.5 text-xs ${importMsg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{importMsg.text}</p>
            )}
            <p className="mt-1 text-[11px] text-neutral-500">
              Pega el enlace y toca <span className="text-neutral-400">Importar</span>: tomamos el nombre, el README y el sitio del repo para llenar lo que esté vacío.
            </p>
          </div>

          <div>
            <p className="neo-label mb-1.5">Enlace de despliegue</p>
            <input value={draft.deployUrl} onChange={(e) => setDraft({ ...draft, deployUrl: e.target.value })} placeholder="https://mi-proyecto.vercel.app" className="neo-input w-full" />
          </div>

          <div>
            <p className="neo-label mb-1.5">Video demostrativo</p>
            <input value={draft.videoUrl} onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })} placeholder="https://youtu.be/..." className="neo-input w-full" />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving} className="neo-btn justify-center">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => { setEditing(false); setDraft(proj) }} className="neo-btn-ghost justify-center">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="neo-aula-body neo-aula-scroll">
      <div className="mx-auto w-full max-w-2xl space-y-5 p-1">
        {isTeacher && (
          <div className="flex items-center gap-2 rounded-xl border border-accent-violet/20 bg-accent-violet/5 px-4 py-2.5 text-xs text-neutral-400">
            <ClipboardIcon size={15} />
            Vista de catedrático: supervisas y evalúas la entrega del grupo (no la editas).
          </div>
        )}

        {/* ── Enunciado asignado (según la modalidad de la clase) ── */}
        {mode !== 'proposal' && (
          <div className="neo-panel space-y-3 p-5">
            <p className="neo-label">Enunciado asignado</p>
            {assigned ? (
              <>
                <h4 className="text-base font-semibold text-white">{assigned.title}</h4>
                {assigned.description.trim() && (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">{assigned.description}</p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {assigned.objectives.trim() && (
                    <div>
                      <p className="neo-label mb-1">Objetivos</p>
                      <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-400">{assigned.objectives}</p>
                    </div>
                  )}
                  {assigned.deliverables.trim() && (
                    <div>
                      <p className="neo-label mb-1">Entregables</p>
                      <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-400">{assigned.deliverables}</p>
                    </div>
                  )}
                </div>
                {assigned.requirements?.trim() && (
                  <div className="rounded-xl border border-accent-violet/20 bg-black/15 p-3">
                    <p className="neo-label mb-1 text-accent-violet">Requisitos</p>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-300">{assigned.requirements}</p>
                  </div>
                )}
                {assigned.dueDate && (
                  <p className="text-xs text-neutral-500">Entrega: <span className="text-neutral-300">{assigned.dueDate}</span></p>
                )}
                {assigned.briefUrl?.trim() && (
                  <a
                    href={safeHref(assigned.briefUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neo-btn w-fit text-xs"
                  >
                    Ver enunciado (PDF) ↗
                  </a>
                )}
              </>
            ) : mode === 'catalog' || mode === 'mixed' ? (
              canEdit ? (
                projects.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    {mode === 'mixed'
                      ? 'No hay proyectos en el catálogo. Propongan el suyo llenando “Nuestra entrega” abajo.'
                      : 'El catedrático aún no ha publicado proyectos para elegir.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-400">
                      {mode === 'mixed'
                        ? 'Elijan uno de estos proyectos, o propongan el suyo llenando “Nuestra entrega” abajo:'
                        : 'Elijan el proyecto en el que trabajará el equipo:'}
                    </p>
                    {projects.map((p) => (
                      <div key={p.id} className="neo-panel flex w-full items-start justify-between gap-3 p-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-100">{p.title}</p>
                          {p.description.trim() && <p className="line-clamp-2 text-xs text-neutral-500">{p.description}</p>}
                          {p.briefUrl?.trim() && (
                            <a
                              href={safeHref(p.briefUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 inline-block text-xs text-accent-violet hover:text-accent-violetBright"
                            >
                              Ver enunciado (PDF) ↗
                            </a>
                          )}
                        </div>
                        <button
                          onClick={() => setGroupProject(group.classId, group.id, p.id)}
                          className="neo-btn flex-shrink-0 text-xs"
                        >
                          Elegir
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-sm text-neutral-500">El equipo aún no ha elegido su proyecto.</p>
              )
            ) : isTeacher ? (
              <div className="flex items-start gap-3 rounded-xl bg-black/20 p-4">
                <ClipboardIcon size={18} />
                <p className="text-sm text-neutral-400">
                  Aún no le asignas un proyecto a este grupo. Asígnalo desde <span className="text-neutral-200">Gestión de grupos</span> para que el equipo pueda trabajar y publicar su entrega.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl bg-black/20 p-4">
                <ClipboardIcon size={18} />
                <p className="text-sm text-neutral-400">
                  El catedrático aún no le asigna un proyecto a tu grupo. Pídeselo por el <span className="text-neutral-200">canal de la clase</span>; mientras tanto podrás preparar los enlaces de tu entrega, pero no habrá enunciado que seguir.
                </p>
              </div>
            )}
            {assigned && canEdit && (mode === 'catalog' || mode === 'mixed') && (
              <button onClick={() => setGroupProject(group.classId, group.id, null)} className="text-xs text-neutral-500 hover:text-accent-violet">
                Cambiar proyecto
              </button>
            )}
          </div>
        )}

        {/* ── Nuestra entrega (showcase del grupo) ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-accent-violet">
            <RocketIcon size={20} />
            <h3 className="text-lg font-semibold text-white">
              {proj.title.trim() || 'Nuestra entrega'}
            </h3>
          </div>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="neo-btn-ghost flex-shrink-0 text-sm">
              {hasAny ? 'Editar' : 'Agregar entrega'}
            </button>
          )}
        </div>

        {proj.description.trim() && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">{proj.description}</p>
        )}

        {links.length > 0 && (
          <div className="space-y-2.5">
            {links.map((l) => (
              <a key={l.key} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" className="neo-panel flex items-center gap-3 p-3.5 transition hover:!shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)]">
                <span className="text-accent-violet">{l.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100">{l.label}</p>
                  <p className="truncate text-xs text-neutral-500">{l.url}</p>
                </div>
                <LinkIcon size={14} />
              </a>
            ))}
          </div>
        )}

        {!hasAny && (
          <div className="neo-panel flex flex-col items-center gap-3 p-10 text-center">
            <RocketIcon size={28} />
            <p className="max-w-sm text-sm text-neutral-400">
              Aún no hay proyecto publicado. {canEdit ? 'Agrega el título, la descripción y los enlaces de tu entregable.' : 'El equipo todavía no ha publicado su proyecto.'}
            </p>
            {canEdit && (
              <button onClick={() => setEditing(true)} className="neo-btn text-sm">Agregar proyecto</button>
            )}
          </div>
        )}

        {/* ── Evaluación del catedrático ── */}
        <GroupEvaluationSection group={group} isTeacher={isTeacher} rubric={assigned?.rubric ?? []} hasSubmission={!!hasAny} />
      </div>
    </div>
  )
}

/**
 * Evaluación de la entrega. El catedrático califica por rúbrica + feedback;
 * los integrantes ven la nota en solo-lectura cuando ya fue calificada.
 */
function GroupEvaluationSection({
  group,
  isTeacher,
  rubric,
  hasSubmission,
}: {
  group: ClassGroup
  isTeacher: boolean
  rubric: { criterion: string; points: number }[]
  hasSubmission: boolean
}) {
  const [ev, setEv] = useState<Evaluation>(getEvaluation(group.id))
  const [editing, setEditing] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const sync = () => setEv(getEvaluation(group.id))
    sync()
    loadEvaluation(group.id)
    const unsub = subscribeEvaluation(group.id)
    const poll = setInterval(() => loadEvaluation(group.id), 5000)
    window.addEventListener(GEVAL_EVENT, sync)
    return () => {
      window.removeEventListener(GEVAL_EVENT, sync)
      clearInterval(poll)
      unsub()
    }
  }, [group.id])

  const graded = isGraded(ev)
  const maxPoints = rubric.reduce((a, r) => a + (r.points || 0), 0)

  function startEdit() {
    // precarga con lo ya calificado, o con la rúbrica en blanco
    const init: Record<string, number> = {}
    rubric.forEach((_, i) => { init[i] = ev.scores[i] ?? 0 })
    setScores(init)
    setFeedback(ev.feedback)
    setEditing(true)
  }

  function setScore(i: number, raw: string, max: number) {
    const n = Math.max(0, Math.min(max, Number(raw) || 0))
    setScores((s) => ({ ...s, [i]: n }))
  }

  const draftTotal = Object.values(scores).reduce((a, n) => a + (Number(n) || 0), 0)

  async function submit() {
    setSaving(true)
    await saveEvaluation(group.id, {
      scores,
      feedback: feedback.trim(),
      maxPoints,
      gradedByName: displayName(getSession()) || 'Catedrático',
    })
    setSaving(false)
    setEditing(false)
  }

  // ── Estudiante / integrante: solo-lectura ──
  if (!isTeacher) {
    if (!graded) {
      return (
        <div className="neo-panel flex items-center gap-3 p-5 text-sm text-neutral-500">
          <ClipboardIcon size={18} />
          <span>Tu entrega aún no ha sido evaluada por el catedrático.</span>
        </div>
      )
    }
    return <EvaluationReadout ev={ev} rubric={rubric} />
  }

  // ── Catedrático: formulario de calificación ──
  if (editing) {
    return (
      <div className="neo-panel space-y-4 p-5">
        <h4 className="flex items-center gap-2 text-base font-semibold text-white">
          <ClipboardIcon size={18} /> {graded ? 'Editar evaluación' : 'Evaluar entrega'}
        </h4>

        {rubric.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Este grupo no tiene una rúbrica asociada. Puedes dejar feedback y una nota general abajo.
          </p>
        ) : (
          <div className="space-y-2.5">
            {rubric.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-2.5">
                <span className="min-w-0 flex-1 text-sm text-neutral-200">{r.criterion}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={r.points}
                    value={scores[i] ?? 0}
                    onChange={(e) => setScore(i, e.target.value, r.points)}
                    className="neo-input w-20 text-right"
                  />
                  <span className="text-xs text-neutral-500">/ {r.points}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="neo-label">Nota total</span>
              <span className="font-semibold text-neutral-100">{draftTotal} / {maxPoints}</span>
            </div>
          </div>
        )}

        <div>
          <p className="neo-label mb-1.5">Retroalimentación</p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Qué estuvo bien, qué mejorar, siguientes pasos…"
            className="neo-input w-full min-h-[100px] resize-y"
            maxLength={1500}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={submit} disabled={saving} className="neo-btn justify-center">
            {saving ? 'Guardando…' : 'Guardar evaluación'}
          </button>
          <button onClick={() => setEditing(false)} className="neo-btn-ghost justify-center">Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {graded ? (
        <EvaluationReadout ev={ev} rubric={rubric} />
      ) : (
        <div className="neo-panel flex flex-col items-center gap-3 p-8 text-center">
          <ClipboardIcon size={26} />
          <p className="max-w-sm text-sm text-neutral-400">
            {hasSubmission
              ? 'Esta entrega todavía no tiene evaluación. Califícala por rúbrica y deja retroalimentación al equipo.'
              : 'El equipo aún no publica su entrega, pero puedes preparar la evaluación cuando lo haga.'}
          </p>
        </div>
      )}
      <button onClick={startEdit} className="neo-btn-ghost text-sm">
        {graded ? 'Editar evaluación' : 'Evaluar entrega'}
      </button>
    </div>
  )
}

/** Tarjeta de solo-lectura con la nota, el desglose por rúbrica y el feedback. */
function EvaluationReadout({ ev, rubric }: { ev: Evaluation; rubric: { criterion: string; points: number }[] }) {
  const pct = ev.grade != null && ev.maxPoints ? Math.round((ev.grade / ev.maxPoints) * 100) : null
  return (
    <div className="neo-panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-accent-violet">
          <ClipboardIcon size={20} />
          <h4 className="text-base font-semibold text-white">Evaluación del catedrático</h4>
        </div>
        {ev.grade != null && (
          <span className="neo-chip neo-chip--gold text-sm">
            {ev.grade}{ev.maxPoints ? ` / ${ev.maxPoints}` : ''}{pct != null ? ` · ${pct}%` : ''}
          </span>
        )}
      </div>

      {rubric.length > 0 && (
        <div className="space-y-2">
          {rubric.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 text-neutral-300">{r.criterion}</span>
              <span className="font-semibold text-neutral-100">{ev.scores[i] ?? 0} / {r.points}</span>
            </div>
          ))}
        </div>
      )}

      {ev.feedback.trim() && (
        <div>
          <p className="neo-label mb-1.5">Retroalimentación</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">{ev.feedback}</p>
        </div>
      )}

      {ev.gradedByName && (
        <p className="text-xs text-neutral-600">
          Evaluado por {ev.gradedByName}
          {ev.gradedAt ? ` · ${new Date(ev.gradedAt).toLocaleDateString()}` : ''}
        </p>
      )}
    </div>
  )
}

function GroupBoard({ group, canEdit }: { group: ClassGroup; canEdit: boolean }) {
  const [tasks, setTasks] = useState<KanTask[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<KanCol | null>(null)
  const [draft, setDraft] = useState<Record<KanCol, string>>({ todo: '', doing: '', done: '' })

  useEffect(() => {
    const sync = () => setTasks(getBoard(group.id))
    sync()
    loadBoard(group.id)
    const unsub = subscribeBoard(group.id)
    const poll = setInterval(() => loadBoard(group.id), 3000)
    window.addEventListener(KANBAN_EVENT, sync)
    return () => {
      window.removeEventListener(KANBAN_EVENT, sync)
      clearInterval(poll)
      unsub()
    }
  }, [group.id])

  const COLS: { key: KanCol; label: string; dot: string }[] = [
    { key: 'todo', label: 'Por hacer', dot: '#6b7079' },
    { key: 'doing', label: 'En progreso', dot: group.color },
    { key: 'done', label: 'Hecho', dot: '#34d399' },
  ]

  function drop(col: KanCol) {
    setOverCol(null)
    if (dragId) moveTask(dragId, col)
    setDragId(null)
  }
  function add(col: KanCol) {
    if (!draft[col].trim()) return
    addTask(group.id, col, draft[col])
    setDraft((d) => ({ ...d, [col]: '' }))
  }

  return (
    <div className="neo-aula-board">
      {COLS.map((col) => {
        const items = tasks.filter((t) => t.col === col.key)
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              if (!canEdit) return
              e.preventDefault()
              setOverCol(col.key)
            }}
            onDragLeave={() => setOverCol((o) => (o === col.key ? null : o))}
            onDrop={() => canEdit && drop(col.key)}
            className={`neo-kan-col ${overCol === col.key ? 'neo-kan-col--over' : ''}`}
          >
            <div className="neo-kan-head">
              <span className="flex items-center gap-2">
                <span className="neo-dot-status" style={{ background: col.dot }} />
                <span className="font-semibold text-neutral-100">{col.label}</span>
              </span>
              <span className="neo-kan-count">{items.length}</span>
            </div>

            <div className="neo-kan-list">
              {items.length === 0 && (
                <p className="px-1 py-4 text-center text-[11px] text-neutral-600">Sin tareas</p>
              )}
              {items.map((task) => (
                <div
                  key={task.id}
                  draggable={canEdit}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`neo-kan-card ${dragId === task.id ? 'neo-kan-card--drag' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-100">{task.title}</p>
                    {canEdit && (
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-neutral-600 hover:text-red-400"
                        title="Eliminar tarea"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {task.assignee && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <span className="neo-kan-assignee">{task.assignee.charAt(0).toUpperCase()}</span>
                      {task.assignee}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="mt-2 flex gap-2">
                <input
                  value={draft[col.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && add(col.key)}
                  placeholder="Nueva tarea…"
                  className="neo-input flex-1 !py-2 text-sm"
                />
                <button onClick={() => add(col.key)} className="neo-kan-add" aria-label="Añadir tarea">
                  +
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChatLine({
  m,
  grouped,
  mine,
  onDelete,
}: {
  m: AulaMsg
  grouped: boolean
  mine: boolean
  onDelete: () => void
}) {
  // perfil EN VIVO (si cambió su foto/nombre) con respaldo al dato del mensaje
  const prof = getProfile(m.author)
  const name = prof?.name ?? m.name
  const avatar = prof?.avatar ?? m.avatar
  return (
    <div className={`neo-bubble-row group ${mine ? 'neo-bubble-row--mine' : ''}`}>
      {!mine &&
        (grouped ? (
          <span className="neo-bubble-spacer" />
        ) : (
          <span className={`neo-aula-msg-av ${m.role === 'teacher' ? 'neo-aula-msg-av--teacher' : ''}`}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
        ))}
      <div className="neo-bubble-col">
        {!grouped && (
          <p className="neo-bubble-meta">
            {!mine && <span className="font-semibold text-neutral-200">{name}</span>}
            {!mine && m.role === 'teacher' && <span className="neo-aula-badge">Catedrático</span>}
            <span className="text-neutral-600">{fmt(m.ts)}</span>
          </p>
        )}
        <div className="neo-bubble-wrap">
          <div className={`neo-bubble ${mine ? 'neo-bubble--mine' : ''}`}>
            {m.text}
            {m.edited && <span className="neo-bubble-edited">(editado)</span>}
          </div>
          {mine && (
            <div className="neo-bubble-actions">
              <button onClick={onDelete} title="Eliminar" className="hover:text-red-400"><TrashIcon size={15} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

const ico = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function GearIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function WaveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="neo-aula-wave">
      <path
        d="M7 11V6.5a1.5 1.5 0 0 1 3 0V10m0-3.5V5a1.5 1.5 0 0 1 3 0v5m0-3.5a1.5 1.5 0 0 1 3 0V13c0 3.5-2.5 6-6 6s-6-2-6.5-4.5c-.3-1.4.8-2 1.7-1.2L7 14.5"
        stroke="#fbbf24"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg {...ico} className="neo-aula-svg">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  )
}
