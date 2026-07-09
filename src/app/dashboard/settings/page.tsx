'use client'

import Header from '@/frontend/components/layout/Header'
import { useT } from '@/frontend/hooks/useT'

export default function SettingsPage() {
  const { t } = useT()

  return (
    <>
      <Header title={t('head.settings.title')} subtitle={t('head.settings.sub')} />

      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {/* Perfil */}
          <section className="neo-panel p-6">
            <h3 className="mb-5 text-lg font-semibold text-white">{t('set.profile')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('set.first_name')}>
                <input className="neo-input w-full" placeholder="John" />
              </Field>
              <Field label={t('set.last_name')}>
                <input className="neo-input w-full" placeholder="Doe" />
              </Field>
              <Field label={t('set.email')} full>
                <input type="email" className="neo-input w-full" placeholder="john@university.edu" />
              </Field>
              <Field label={t('set.bio')} full>
                <textarea rows={3} className="neo-input w-full resize-none" placeholder={t('set.bio_ph')} />
              </Field>
            </div>
            <div className="mt-5 flex gap-3">
              <button className="neo-btn">{t('set.save')}</button>
              <button className="neo-btn-ghost">{t('set.cancel')}</button>
            </div>
          </section>

          {/* Seguridad */}
          <section className="neo-panel p-6">
            <h3 className="mb-5 text-lg font-semibold text-white">{t('set.security')}</h3>
            <div className="space-y-4">
              <Field label={t('set.current_pw')}>
                <input type="password" className="neo-input w-full" placeholder="••••••••" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t('set.new_pw')}>
                  <input type="password" className="neo-input w-full" placeholder="••••••••" />
                </Field>
                <Field label={t('set.confirm_pw')}>
                  <input type="password" className="neo-input w-full" placeholder="••••••••" />
                </Field>
              </div>
            </div>
            <div className="mt-5">
              <button className="neo-btn">{t('set.update_pw')}</button>
            </div>
          </section>

          {/* Preferencias */}
          <section className="neo-panel p-6">
            <h3 className="mb-5 text-lg font-semibold text-white">{t('set.prefs')}</h3>
            <div className="space-y-2">
              <Toggle label={t('set.email_notif')} defaultChecked />
              <Toggle label={t('set.public_profile')} defaultChecked />
              <Toggle label={t('set.recommend')} />
            </div>
          </section>

          {/* Zona de peligro */}
          <section className="neo-panel p-6 border border-red-500/30">
            <h3 className="mb-2 text-lg font-semibold text-red-400">{t('set.danger')}</h3>
            <p className="mb-4 text-sm text-neutral-500">{t('set.danger_text')}</p>
            <button className="neo-btn-danger">{t('set.delete')}</button>
          </section>
        </div>
      </main>
    </>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 ${full ? 'sm:col-span-2' : ''}`}>
      <label className="neo-label">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="neo-row flex cursor-pointer items-center justify-between p-3 text-sm text-neutral-300">
      <span>{label}</span>
      <input type="checkbox" defaultChecked={defaultChecked} className="neo-check" />
    </label>
  )
}
