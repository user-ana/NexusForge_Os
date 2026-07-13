'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createProject, uploadBrief, type RubricItem } from '@/backend/services/projects'
import type { GroupMode, LeaderMode } from '@/backend/services/classes'
import NeoSelect from '@/frontend/components/ui/NeoSelect'
import NeoDate from '@/frontend/components/ui/NeoDate'
import { useT } from '@/frontend/hooks/useT'
import { PARCIAL_OPTIONS, type ParcialCode } from '@/shared/parciales'

type Draft = {
  title: string
  description: string
  objectives: string
  deliverables: string
  dueDate: string
  teamSize: number
  groupMode: GroupMode
  leaderMode: LeaderMode
  parcial: ParcialCode
  briefUrl: string
  requirements: string
  rubric: RubricItem[]
}
const EMPTY: Draft = {
  title: '', description: '', objectives: '', deliverables: '', dueDate: '',
  teamSize: 4, groupMode: 'open', leaderMode: 'first', parcial: '', briefUrl: '', requirements: '', rubric: [{ criterion: '', points: 0 }],
}

type BriefMode = 'pdf' | 'link' | 'text'

/**
 * Modal reutilizable para crear un proyecto. Pensado para que sea FÁCIL:
 * lo esencial siempre visible (título, parcial, fecha, enunciado), y el resto
 * (objetivos, entregables, rúbrica, grupos) en "Más detalles" opcional.
 * El enunciado puede ser un PDF subido, un link pegado o texto escrito.
 */
export default function CreateProjectModal({
  classId,
  open,
  onClose,
  onCreated,
}: {
  classId: string
  open: boolean
  onClose: () => void
  onCreated?: () => void
}) {
  const { t } = useT()
  const [mounted, setMounted] = useState(false)
  const [d, setD] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [briefMode, setBriefMode] = useState<BriefMode>('pdf')
  const [showDetails, setShowDetails] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadErr, setUploadErr] = useState('')
  const [titleErr, setTitleErr] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  // Recompone tildes (NFC) para que el texto pegado desde PDFs no salga como "ci´on".
  const nfc = (s: string) => s.normalize('NFC')

  function reset() {
    setD(EMPTY)
    setBriefMode('pdf')
    setShowDetails(false)
    setUploadName('')
    setUploadErr('')
    setTitleErr(false)
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr('')
    setUploading(true)
    const url = await uploadBrief(classId, file)
    setUploading(false)
    if (url) {
      setD((p) => ({ ...p, briefUrl: url }))
      setUploadName(file.name)
    } else {
      setUploadErr(t('proj.brief_upload_err'))
    }
  }

  async function submit() {
    if (saving || uploading) return
    if (!d.title.trim()) {
      setTitleErr(true)
      return
    }
    setSaving(true)
    const created = await createProject({
      classId,
      title: d.title,
      description: d.description,
      objectives: d.objectives,
      deliverables: d.deliverables,
      rubric: d.rubric.filter((r) => r.criterion.trim()),
      dueDate: d.dueDate,
      teamSize: d.teamSize,
      groupMode: d.groupMode,
      leaderMode: d.leaderMode,
      parcial: d.parcial,
      briefUrl: d.briefUrl.trim(),
      requirements: d.requirements.trim(),
    })
    setSaving(false)
    if (created) {
      reset()
      onCreated?.()
      onClose()
    }
  }

  if (!open || !mounted) return null

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onClose}>
      <div className="neo-modal neo-modal--form space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-white">{t('proj.create_title')}</h4>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">✕</button>
        </div>

        {/* ---------- LO ESENCIAL ---------- */}
        <Field label={t('proj.name')}>
          <input
            value={d.title}
            onChange={(e) => { setD({ ...d, title: nfc(e.target.value) }); if (titleErr) setTitleErr(false) }}
            placeholder={t('proj.name_ph')}
            className={`neo-input w-full ${titleErr ? 'ring-1 ring-red-500/70' : ''}`}
          />
          {titleErr && <p className="text-xs text-red-400">{t('proj.title_required')}</p>}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('proj.parcial')}>
            <NeoSelect value={d.parcial} onChange={(v) => setD({ ...d, parcial: v as ParcialCode })} options={PARCIAL_OPTIONS} />
          </Field>
          <Field label={t('proj.due')}>
            <NeoDate value={d.dueDate} onChange={(v) => setD({ ...d, dueDate: v })} />
          </Field>
        </div>

        {/* Enunciado: subir PDF · pegar link · escribir */}
        <Field label={t('proj.desc')}>
          <div className="mb-2 flex gap-1 rounded-lg bg-black/25 p-1">
            {(['pdf', 'link', 'text'] as BriefMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setBriefMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  briefMode === m ? 'bg-accent-violet text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {m === 'pdf' ? t('proj.brief_mode_pdf') : m === 'link' ? t('proj.brief_mode_link') : t('proj.brief_mode_text')}
              </button>
            ))}
          </div>

          {briefMode === 'pdf' && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={onPickFile} />
              {uploadName ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3 text-sm">
                  <span className="truncate text-neutral-200">{uploadName}</span>
                  <button
                    type="button"
                    onClick={() => { setUploadName(''); setD((p) => ({ ...p, briefUrl: '' })) }}
                    className="flex-shrink-0 text-xs text-neutral-500 hover:text-red-400"
                  >
                    {t('proj.brief_remove')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/15 px-4 py-6 text-sm text-neutral-400 transition hover:border-accent-violet/50 hover:text-neutral-200 disabled:opacity-60"
                >
                  {uploading ? t('proj.brief_uploading') : t('proj.brief_upload')}
                </button>
              )}
              {uploadErr && <p className="mt-1.5 text-xs text-red-400">{uploadErr}</p>}
            </div>
          )}

          {briefMode === 'link' && (
            <input
              type="url"
              value={d.briefUrl}
              onChange={(e) => setD({ ...d, briefUrl: e.target.value })}
              placeholder={t('proj.brief_url_ph')}
              className="neo-input w-full"
            />
          )}

          {briefMode === 'text' && (
            <textarea
              rows={4}
              value={d.description}
              onChange={(e) => setD({ ...d, description: nfc(e.target.value) })}
              placeholder={t('proj.desc_ph')}
              className="neo-input w-full resize-none"
            />
          )}
        </Field>

        {/* ---------- MÁS DETALLES (opcional) ---------- */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-accent-violet hover:text-accent-violetBright"
        >
          <span className="text-xs">{showDetails ? '▾' : '▸'}</span> {t('proj.more_details')}
        </button>

        {showDetails && (
          <div className="space-y-4 border-t border-white/5 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('proj.objectives')}>
                <textarea rows={3} value={d.objectives} onChange={(e) => setD({ ...d, objectives: nfc(e.target.value) })} className="neo-input w-full resize-none" />
              </Field>
              <Field label={t('proj.deliverables')}>
                <textarea rows={3} value={d.deliverables} onChange={(e) => setD({ ...d, deliverables: nfc(e.target.value) })} className="neo-input w-full resize-none" />
              </Field>
            </div>

            <Field label={t('proj.requirements')}>
              <textarea
                rows={2}
                value={d.requirements}
                onChange={(e) => setD({ ...d, requirements: nfc(e.target.value) })}
                placeholder={t('proj.requirements_ph')}
                className="neo-input w-full resize-none"
              />
            </Field>

            {/* Rúbrica */}
            <Field label={t('proj.rubric')}>
              <div className="space-y-2">
                {d.rubric.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={r.criterion}
                      onChange={(e) => setD({ ...d, rubric: d.rubric.map((x, j) => (j === i ? { ...x, criterion: nfc(e.target.value) } : x)) })}
                      placeholder={t('proj.criterion')}
                      className="neo-input flex-1"
                    />
                    <input
                      type="number"
                      value={r.points}
                      onChange={(e) => setD({ ...d, rubric: d.rubric.map((x, j) => (j === i ? { ...x, points: +e.target.value } : x)) })}
                      placeholder={t('proj.points')}
                      className="neo-input w-20"
                    />
                    <button onClick={() => setD({ ...d, rubric: d.rubric.filter((_, j) => j !== i) })} className="neo-btn-ghost px-3">✕</button>
                  </div>
                ))}
                <button onClick={() => setD({ ...d, rubric: [...d.rubric, { criterion: '', points: 0 }] })} className="text-xs text-accent-violet hover:text-accent-violetBright">
                  {t('proj.add_criterion')}
                </button>
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('proj.group_mode')}>
                <NeoSelect
                  value={d.groupMode}
                  onChange={(v) => setD({ ...d, groupMode: v as GroupMode })}
                  options={[
                    { value: 'open', label: t('cls.gm_open') },
                    { value: 'assign', label: t('cls.gm_assign') },
                    { value: 'hybrid', label: t('cls.gm_hybrid') },
                  ]}
                />
              </Field>
              <Field label={t('proj.leader_mode')}>
                <NeoSelect
                  value={d.leaderMode}
                  onChange={(v) => setD({ ...d, leaderMode: v as LeaderMode })}
                  options={[
                    { value: 'teacher', label: t('cls.lm_teacher') },
                    { value: 'group', label: t('cls.lm_group') },
                    { value: 'first', label: t('cls.lm_first') },
                  ]}
                />
              </Field>
            </div>

            <div className="w-32">
              <Field label={t('proj.team_size')}>
                <input type="number" min={1} max={8} value={d.teamSize} onChange={(e) => setD({ ...d, teamSize: +e.target.value })} className="neo-input w-full" />
              </Field>
            </div>
          </div>
        )}

        <button onClick={submit} disabled={saving || uploading} className="neo-btn w-full justify-center">
          {saving ? '…' : t('proj.create')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="neo-label">{label}</label>
      {children}
    </div>
  )
}
