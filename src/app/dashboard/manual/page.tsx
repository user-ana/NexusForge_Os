'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Header from '@/frontend/components/layout/Header'

/* ────────────────────────────────────────────────────────────────────────── *
 *  Manuales del proyecto (Usuario + Programador). Documentación viva dentro de
 *  la propia plataforma, con inspector de código flotante y tarjetas de concepto.
 * ────────────────────────────────────────────────────────────────────────── */

export default function ManualPage() {
  const [tab, setTab] = useState<'user' | 'dev'>('dev')
  const [inspect, setInspect] = useState<Snippet | null>(null)

  return (
    <>
      <Header title="Manuales" subtitle="Guía de operación y documentación del sistema" />

      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          {/* Selector de manual */}
          <div className="flex w-fit gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
            <TabBtn active={tab === 'user'} onClick={() => setTab('user')}>Manual de Usuario</TabBtn>
            <TabBtn active={tab === 'dev'} onClick={() => setTab('dev')}>Manual del Programador</TabBtn>
          </div>

          {tab === 'dev' ? <DevManual onInspect={setInspect} /> : <UserManual />}
        </div>
      </main>

      {inspect && <CodeInspector snippet={inspect} onClose={() => setInspect(null)} />}
    </>
  )
}

/* ─────────────── MANUAL DEL PROGRAMADOR ─────────────── */

function DevManual({ onInspect }: { onInspect: (s: Snippet) => void }) {
  return (
    <div className="space-y-8">
      {/* El proyecto */}
      <section className="neo-panel overflow-hidden p-0">
        <div className="border-b border-white/5 bg-gradient-to-br from-accent-violet/10 to-transparent p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent-violet">El proyecto</p>
          <h2 className="mt-1 text-2xl font-bold text-white">NexusForge OS</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-300">
            Plataforma web académica <b className="text-neutral-100">fullstack</b> para gestionar proyectos de
            ingeniería de software: clases, módulos, proyectos por parcial, formación de grupos, tableros Kanban,
            chat en vivo y evaluación por rúbrica; con un <b className="text-neutral-100">asistente de IA propio y
            privado</b> que consulta y ejecuta acciones por lenguaje natural. Está desplegada en Vercel y usa
            Supabase (PostgreSQL) como base de datos con seguridad a nivel de fila.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-6">
          {['Next.js 14 (App Router)', 'TypeScript estricto', 'React', 'Tailwind CSS', 'Supabase (PostgreSQL + Auth + Realtime)', 'Ollama + Llama 3', 'Vercel'].map((s) => (
            <span key={s} className="rounded-full border border-white/8 bg-white/[0.04] px-3.5 py-1.5 text-sm text-neutral-200 transition hover:scale-105 hover:border-white/15 hover:bg-white/[0.08]">{s}</span>
          ))}
        </div>
      </section>

      {/* Stack: por qué cada pieza */}
      <section>
        <SectionTitle icon={<StackGlyph />}>El stack y por qué</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map((s) => (
            <MiniCard key={s.name} icon={s.icon} title={s.name} desc={s.why} />
          ))}
        </div>
      </section>

      {/* Arquitectura */}
      <section>
        <SectionTitle icon={<FolderGlyph />}>Arquitectura del código</SectionTitle>
        <div className="neo-panel p-5">
          <pre className="overflow-x-auto rounded-lg bg-[#0b0d10] p-4 text-[12.5px] leading-relaxed text-neutral-400">{ARCH_TREE}</pre>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            Separación por responsabilidad (al ingeniero le gusta el orden): <span className="text-neutral-300">frontend</span> (la vista),
            <span className="text-neutral-300"> backend</span> (los datos y servicios), <span className="text-neutral-300">shared</span> (tipos y reglas transversales)
            y <span className="text-neutral-300"> app</span> (el routing de Next.js: páginas + endpoints API).
          </p>
        </div>
      </section>

      {/* Modelo de datos */}
      <section>
        <SectionTitle icon={<DbGlyph />}>Modelo de datos</SectionTitle>
        <p className="mb-3 text-sm text-neutral-500">Tablas principales en PostgreSQL. Todas con RLS: cada usuario solo ve/edita lo que le corresponde.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TABLES.map((t) => (
            <div key={t.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="font-mono text-sm font-semibold text-accent-violet">{t.name}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Inspectores de código */}
      <section>
        <SectionTitle icon={<TerminalGlyph />}>Inspectores de código</SectionTitle>
        <p className="mb-3 text-sm text-neutral-500">Abre cada tarjeta para ver el código real explicado línea por línea. Puedes arrastrar la terminal.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SNIPPETS.map((s) => (
            <button
              key={s.id}
              onClick={() => onInspect(s)}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-left transition-all duration-[350ms] ease-out hover:scale-[1.02] hover:border-white/12 hover:bg-white/[0.055] hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.75)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-accent-violet transition group-hover:bg-white/[0.09]">{s.icon}</span>
              <p className="text-base font-semibold text-white">{s.title}</p>
              <p className="text-sm text-neutral-500">{s.subtitle}</p>
              <span className="mt-1 text-sm font-medium text-accent-violet">Ver código →</span>
            </button>
          ))}
        </div>
      </section>

      {/* Cómo funciona la IA (flujo) */}
      <section>
        <SectionTitle icon={<SparkGlyph />}>Cómo funciona el asistente (flujo)</SectionTitle>
        <div className="neo-panel p-5">
          <div className="space-y-1">
            {AI_FLOW.map((f, i) => (
              <FlowRow key={i} n={i + 1} last={i === AI_FLOW.length - 1} title={f.title} desc={f.desc} />
            ))}
          </div>
        </div>
      </section>

      {/* Robustez */}
      <section>
        <SectionTitle icon={<ShieldGlyph />}>Robustez del asistente</SectionTitle>
        <p className="mb-3 text-sm text-neutral-500">El modelo es pequeño (3B) y a veces se confunde; la confiabilidad viene de <b className="text-neutral-300">código de validación</b> alrededor.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SAFEGUARDS.map((s) => (
            <MiniCard key={s.name} icon={s.icon} title={s.name} desc={s.why} />
          ))}
        </div>
      </section>

      {/* Diccionario / conceptos */}
      <section>
        <SectionTitle icon={<BookGlyph />}>Diccionario de conceptos</SectionTitle>
        <p className="mb-3 text-sm text-neutral-500">Pasa el cursor sobre cada tarjeta para ver el detalle.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONCEPTS.map((c) => (
            <ConceptCard key={c.term} c={c} />
          ))}
        </div>
      </section>

      {/* Instalación y despliegue */}
      <section>
        <SectionTitle icon={<PlayGlyph />}>Instalación y despliegue</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="neo-panel overflow-hidden p-0">
            <div className="border-b border-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">Correr en local</div>
            <div className="bg-[#0b0d10] p-4 font-mono text-[12.5px] leading-relaxed">
              <p className="text-neutral-500"># 1. Instalar dependencias</p>
              <p className="text-emerald-300">npm install</p>
              <p className="mt-2 text-neutral-500"># 2. Configurar .env.local (ver a la derecha)</p>
              <p className="mt-2 text-neutral-500"># 3. Levantar el servidor de desarrollo</p>
              <p className="text-emerald-300">npm run dev <span className="text-neutral-600"># localhost:3000</span></p>
              <p className="mt-2 text-neutral-500"># 4. (IA, opcional) Ollama con el modelo</p>
              <p className="text-emerald-300">ollama pull llama3.2</p>
              <p className="text-emerald-300">ollama run llama3.2 <span className="text-neutral-600"># probar</span></p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="neo-panel p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Variables de entorno (.env.local)</p>
              <div className="space-y-2">
                {ENV.map((e) => (
                  <div key={e.key} className="rounded-lg bg-[#0b0d10] p-2.5 font-mono text-[12px]">
                    <span className="text-accent-violet">{e.key}</span>
                    <span className="text-neutral-600"> = </span>
                    <span className="text-emerald-300">{e.val}</span>
                    <p className="mt-1 font-sans text-[11px] text-neutral-500">{e.note}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="neo-panel flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-accent-violet"><RocketGlyph /></span>
              <div>
                <p className="text-sm font-semibold text-neutral-100">Despliegue continuo</p>
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
                  El repo está en GitHub. Cada <span className="font-mono text-neutral-300">git push</span> a la rama
                  <span className="font-mono text-neutral-300"> main</span> hace que Vercel reconstruya y publique
                  la web automáticamente en <span className="text-neutral-300">nexusforgeos.vercel.app</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ─────────────── MANUAL DE USUARIO ─────────────── */

function UserManual() {
  return (
    <div className="space-y-8">
      {/* Intro */}
      <section className="neo-panel overflow-hidden p-0">
        <div className="border-b border-white/5 bg-gradient-to-br from-accent-violet/10 to-transparent p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent-violet">Manual de usuario</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Cómo usar la plataforma</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-300">
            NexusForge OS conecta al catedrático con sus estudiantes en torno a proyectos de ingeniería.
            El catedrático gestiona clases, proyectos y evaluación; los estudiantes se organizan en grupos,
            trabajan con tableros y publican su entrega. Aquí tienes la guía paso a paso de cada rol.
          </p>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-3">
          <RoleCard color="#a78bfa" title="Catedrático" desc="Crea clases y proyectos, forma grupos, supervisa y evalúa por rúbrica. Usa el asistente de IA." />
          <RoleCard color="#60a5fa" title="Estudiante" desc="Se une a la clase con un código, elige grupo, organiza tareas en Kanban y publica su entregable." />
          <RoleCard color="#34d399" title="Visitante" desc="Explora la plataforma en modo lectura, sin gestionar clases ni entregar proyectos." />
        </div>
      </section>

      {/* Guías por rol */}
      <section className="grid gap-6 lg:grid-cols-2">
        <StepColumn
          title="Como catedrático"
          color="#a78bfa"
          steps={[
            ['Crea tu clase', 'Ve a Mis Clases y crea una clase (nombre, sección, período). Se genera un código único; compártelo con tus estudiantes para que se inscriban.'],
            ['Crea los proyectos', 'Desde la clase o el aula, abre "Nuevo proyecto": sube el enunciado como PDF, pega un link (Overleaf/Drive) o escríbelo. Asigna el parcial (1, 2, 3 o final), la rúbrica y los requisitos.'],
            ['Elige la modalidad de grupos', 'Dos formas: tú asignas manualmente a cada estudiante, o activas la auto-inscripción para que ellos elijan su grupo (con cupo máximo y bloqueo al unirse).'],
            ['Asigna proyectos a los grupos', 'Si el proyecto es asignado, desde las tarjetas de cada grupo eliges qué proyecto le toca. También puedes dejar que el grupo elija de una lista.'],
            ['Supervisa en solo lectura', 'Entra al aula de un grupo: ves su tablero Kanban y su entrega, pero no editas su trabajo. Tu rol es supervisar, no hacer las tareas.'],
            ['Evalúa por rúbrica', 'Califica cada entrega según los criterios de la rúbrica. La nota queda registrada por parcial.'],
            ['Apóyate en el asistente IA', 'Abre el orbe flotante para preguntar ("¿qué grupos no han entregado?") o para crear/eliminar por comando, siempre con tu confirmación.'],
          ]}
        />
        <StepColumn
          title="Como estudiante"
          color="#60a5fa"
          steps={[
            ['Únete a la clase', 'En tu panel, escribe el código que te dio el catedrático. Quedarás inscrito en la clase.'],
            ['Elige tu escuadrón', 'Si la clase usa auto-inscripción, entra a "Elige tu escuadrón" y únete a un grupo con cupo. Al unirte quedas fijo en ese grupo.'],
            ['Lee el enunciado', 'En la pestaña Proyecto de tu grupo, abre el enunciado (PDF o link) y revisa los requisitos y la rúbrica con la que te evaluarán.'],
            ['Organiza las tareas', 'Usa el tablero Kanban del grupo: mueve las tarjetas entre Por hacer, En progreso y Hecho para coordinar al equipo.'],
            ['Coordina en el chat', 'Chatea con tu grupo y con la clase en tiempo real; participa en la comunidad para dudas y avisos.'],
            ['Publica tu entrega', 'En Proyecto, agrega los enlaces de tu entregable: repositorio, despliegue y video de demostración.'],
          ]}
        />
      </section>

      {/* Asistente IA */}
      <section>
        <SectionTitle icon={<SparkGlyph />}>El asistente de IA</SectionTitle>
        <div className="neo-panel p-5">
          <p className="text-sm leading-relaxed text-neutral-300">
            Abajo a la derecha hay un <b className="text-neutral-100">orbe flotante</b>. Ábrelo y escríbele en lenguaje
            natural. Puede <b className="text-neutral-100">consultar</b> tus datos o <b className="text-neutral-100">ejecutar
            acciones</b>. Todo lo que crea o elimina te lo muestra en una tarjeta para que lo <b className="text-neutral-100">confirmes</b> antes.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ExampleBlock tone="violet" title="Consultas (solo lee)" items={['¿Quién no está en ningún grupo?', '¿Qué grupos no tienen proyecto?', '¿Cuántos estudiantes hay en la clase?', 'Muéstrame a Ana y todo su trabajo']} />
            <ExampleBlock tone="amber" title="Acciones (con confirmación)" items={['Crea una clase llamada Redes', 'Crea 5 grupos en Sistemas Abiertos 2', 'Crea un proyecto de API REST para el parcial 2', 'Elimina la clase de prueba']} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-neutral-500">
            Nota: el asistente es <b className="text-neutral-400">privado y local</b> (corre en la máquina, no manda datos a la nube)
            y solo responde con base en tus datos reales, no inventa.
          </p>
        </div>
      </section>

      {/* Glosario */}
      <section>
        <SectionTitle icon={<BookGlyph />}>Glosario rápido</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-neutral-100">{g.term}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{g.def}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <SectionTitle icon={<HelpGlyph />}>Preguntas frecuentes</SectionTitle>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>
    </div>
  )
}

/* ─────────────── COMPONENTES ─────────────── */

function RoleCard({ color, title, desc }: { color: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4" style={{ borderTop: `3px solid ${color}` }}>
      <p className="text-sm font-bold text-white" style={{ color }}>{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{desc}</p>
    </div>
  )
}

function MiniCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 transition-all duration-[350ms] ease-out hover:border-white/12 hover:bg-white/[0.05]">
      <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-accent-violet">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">{desc}</p>
      </div>
    </div>
  )
}

function FlowRow({ n, title, desc, last }: { n: number; title: string; desc: string; last?: boolean }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-violet/15 text-sm font-bold text-accent-violet">{n}</span>
        {!last && <span className="my-1 w-px flex-1 bg-white/10" />}
      </div>
      <div className={last ? '' : 'pb-4'}>
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">{desc}</p>
      </div>
    </div>
  )
}

function ExampleBlock({ tone, title, items }: { tone: 'violet' | 'amber'; title: string; items: string[] }) {
  const accent = tone === 'violet' ? 'text-accent-violet' : 'text-amber-400'
  const dot = tone === 'violet' ? 'bg-accent-violet' : 'bg-amber-400'
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className={`mb-2.5 text-xs font-semibold uppercase tracking-wider ${accent}`}>{title}</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-neutral-300">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
            <span className="italic">&ldquo;{it}&rdquo;</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition hover:bg-white/[0.02]">
        <span className="text-sm font-medium text-neutral-100">{q}</span>
        <span className={`text-neutral-500 transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-[350ms] ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-[13px] leading-relaxed text-neutral-400">{a}</p>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${active ? 'bg-accent-violet text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
    >
      {children}
    </button>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-neutral-400">
      <span className="text-accent-violet">{icon}</span>
      {children}
    </h3>
  )
}

function ConceptCard({ c }: { c: Concept }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all duration-[350ms] ease-out hover:scale-[1.02] hover:border-white/12 hover:bg-white/[0.055] hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.75)]">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-accent-violet transition-colors duration-[350ms] group-hover:bg-white/[0.09]">{c.icon}</span>
        <p className="text-base font-semibold text-white">{c.term}</p>
      </div>
      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-[350ms] ease-out group-hover:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <p className="pt-3 text-sm leading-relaxed text-neutral-400 opacity-0 transition-opacity duration-[350ms] group-hover:opacity-100">{c.detail}</p>
        </div>
      </div>
      <p className="pt-2.5 text-[10px] uppercase tracking-wider text-neutral-600 transition-opacity duration-200 group-hover:opacity-0">Hover para ver</p>
    </div>
  )
}

function StepColumn({ title, color, steps }: { title: string; color: string; steps: [string, string][] }) {
  return (
    <div className="neo-panel p-5" style={{ borderTop: `3px solid ${color}` }}>
      <h3 className="mb-4 text-base font-bold text-white">{title}</h3>
      <div className="space-y-3">
        {steps.map(([t, d], i) => (
          <div key={i} className="flex gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: `${color}33`, color }}>
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-100">{t}</p>
              <p className="text-xs leading-relaxed text-neutral-400">{d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────────── INSPECTOR DE CÓDIGO (terminal flotante) ─────────────── */

function CodeInspector({ snippet, onClose }: { snippet: Snippet; onClose: () => void }) {
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!drag.current) return
      setPos({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy })
    }
    function up() {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  function startDrag(e: React.PointerEvent) {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
  }

  const section = snippet.sections[active]
  const hl = new Set(section.lines)
  const lines = snippet.code.split('\n')

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onClose}>
      {/* Wrapper arrastrable (el transform va aqui para no chocar con la animacion de entrada) */}
      <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} onClick={(e) => e.stopPropagation()}>
        <div className="neo-inspector">
          {/* Barra de terminal (arrastrable) — estilo Linux, mate */}
          <div onPointerDown={startDrag} className="flex cursor-grab select-none items-center gap-3 border-b border-black/40 bg-[#101216] px-4 py-3 active:cursor-grabbing">
            {/* Semáforo de ventana */}
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#e05a52]" />
              <span className="h-3 w-3 rounded-full bg-[#e0a93b]" />
              <span className="h-3 w-3 rounded-full bg-[#4caf58]" />
            </div>
            {/* Título centrado, como pestaña de terminal */}
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-neutral-400">
              <TerminalGlyph />
              <p className="truncate font-mono text-[13px] text-neutral-300">{snippet.file}</p>
            </div>
            <button onClick={onClose} className="rounded-md px-2 py-0.5 text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Cerrar">✕</button>
          </div>
          {/* Sub-barra: nombre + pista de arrastre */}
          <div className="flex items-center justify-between border-b border-black/40 bg-[#131519] px-5 py-2.5">
            <p className="text-[13px] font-semibold text-neutral-200">{snippet.title}</p>
            <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-neutral-600">
              <DragGlyph /> arrastra para mover
            </p>
          </div>

          <div className="grid md:grid-cols-[240px_1fr]">
            {/* Sidebar de secciones + nota */}
            <div className="flex flex-col border-b border-white/8 p-3.5 md:border-b-0 md:border-r">
              <div className="space-y-1">
                {snippet.sections.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`w-full rounded-lg px-3.5 py-2.5 text-left text-sm transition-all duration-200 ${
                      i === active ? 'bg-accent-violet/15 font-semibold text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div key={active} className="neo-hl mt-4 rounded-xl border-l-2 border-accent-violet bg-white/[0.03] p-3.5 text-[13px] leading-relaxed text-neutral-300">
                {section.note}
              </div>
            </div>

            {/* Terminal con líneas resaltadas */}
            <div key={active} className="overflow-x-auto bg-[#0b0d10] p-5 font-mono text-[13px] leading-[1.7] md:max-h-[64vh] md:min-h-[440px] md:overflow-y-auto">
              {lines.map((line, i) => {
                const on = hl.has(i)
                return (
                  <div
                    key={i}
                    className={`-mx-1 whitespace-pre border-l-2 px-2.5 transition-all duration-300 ${
                      on ? 'neo-hl border-emerald-400/60 bg-white/[0.05] text-neutral-100' : 'border-transparent text-neutral-700'
                    }`}
                  >
                    <span className="mr-3 select-none text-neutral-800">{String(i + 1).padStart(2, ' ')}</span>
                    {line || ' '}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DragGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

/* ─────────────── DATOS ─────────────── */

const ARCH_TREE = `src/
  app/          -> Rutas Next.js (paginas + API, ej. /api/assistant)
  frontend/     -> LA VISTA (components, hooks, i18n, session)
  backend/      -> LOS DATOS (supabase, services, realtime, external)
  shared/       -> Transversal (tipos, reglas de parciales)
supabase/schema.sql   -> Esquema de la base de datos + seguridad (RLS)`

type Section = { label: string; lines: number[]; note: string }
type Snippet = { id: string; title: string; subtitle: string; file: string; icon: React.ReactNode; code: string; sections: Section[] }

const SNIPPETS: Snippet[] = [
  {
    id: 'ai-route',
    title: 'Implementación de la IA',
    subtitle: 'Conexión con Llama vía Ollama',
    file: 'src/app/api/assistant/route.ts',
    icon: <SparkGlyph />,
    code: `// La app le habla a Llama (Ollama) con la pregunta + los datos
const res = await fetch(base + '/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'llama3.2',
    stream: false,
    keep_alive: '30m',                 // modelo cargado en memoria
    options: { temperature: 0.2,       // preciso, no inventa
               num_predict: 400 },     // respuesta acotada = rapido
    tools,                             // crear/eliminar (agentico)
    messages: [
      { role: 'system', content: system },  // instrucciones + DATOS
      { role: 'user',   content: question },
    ],
  }),
})
// Llama responde: TEXTO (consulta) o TOOL_CALL (accion a confirmar)`,
    sections: [
      { label: 'Conexión con Ollama', lines: [1, 2], note: 'La app hace una petición al servidor de Ollama (local) para hablar con el modelo Llama.' },
      { label: 'El modelo', lines: [4], note: 'Usamos Llama 3.2 corriendo LOCAL. Privado: los datos de los estudiantes no salen de la máquina.' },
      { label: 'Parámetros', lines: [6, 7, 8], note: 'temperature 0.2 = preciso (no inventa); keep_alive = modelo cargado en RAM (rápido); num_predict = respuesta acotada.' },
      { label: 'Herramientas (agéntico)', lines: [9], note: 'Las funciones que la IA puede pedir usar (crear/eliminar). Esto la hace "agéntica": no solo habla, actúa.' },
      { label: 'Contexto (RAG)', lines: [11], note: 'El mensaje "system" lleva las instrucciones + el resumen real de la clase, para que responda con datos ciertos.' },
      { label: 'La respuesta', lines: [16], note: 'Llama responde con TEXTO (una consulta) o con una ACCIÓN (tool_call) que el catedrático confirma antes de ejecutar.' },
    ],
  },
  {
    id: 'ai-rag',
    title: 'RAG: datos reales',
    subtitle: 'Resumen de la clase para la IA',
    file: 'src/backend/services/studentSearch.ts',
    icon: <DataGlyph />,
    code: `// getAssistantContext(): arma un resumen de TODA la clase
// que se le pasa a la IA como contexto (para que no invente).
CLASES:
- Sistemas Abiertos 2 (SA2-2026-P2): 2 estudiantes, 7 grupos
ESTUDIANTES:
- Ana Montes | grupo VIKINGOS (lider) | proyecto App Web | nota sin calificar
GRUPOS:
- VIKINGOS: proyecto App Web, 2 integrantes, entrega no, nota sin calificar
- SALA2: sin proyecto, 0 integrantes`,
    sections: [
      { label: 'Qué es RAG', lines: [0, 1], note: 'RAG = darle a la IA datos reales como contexto para que responda con hechos y NO invente (no alucina).' },
      { label: 'Clases', lines: [2, 3], note: 'Se listan las clases del catedrático con su código y totales de estudiantes y grupos.' },
      { label: 'Estudiantes', lines: [4, 5], note: 'Cada estudiante con su grupo, si es líder, su proyecto y su nota.' },
      { label: 'Grupos', lines: [6, 7, 8], note: 'Cada grupo con su proyecto, integrantes, si entregó y su nota.' },
    ],
  },
  {
    id: 'groups',
    title: 'Formación de grupos',
    subtitle: 'Auto-inscripción segura (SQL)',
    file: 'supabase/schema.sql',
    icon: <ShieldGlyph />,
    code: `-- Funcion segura: el estudiante se une SOLO si se cumplen las reglas.
create function join_class_group(gid uuid)
  security definer as $$
begin
  -- 1) debe estar inscrito en la clase
  -- 2) modo "auto-inscripcion" activo
  -- 3) NO estar ya en un grupo (bloqueo)
  -- 4) que haya cupo
  insert into group_members (group_id, student_id)
  values (gid, auth.uid());
end; $$;`,
    sections: [
      { label: 'Función segura', lines: [1, 2], note: 'security definer = una función del servidor que valida permisos antes de actuar.' },
      { label: 'Las reglas', lines: [4, 5, 6, 7], note: 'Valida: inscrito en la clase, modo auto-inscripción activo, no estar ya en un grupo (bloqueo) y que haya cupo.' },
      { label: 'El resultado', lines: [8, 9], note: 'Si todo se cumple, mete al estudiante al grupo. El alumno NO puede hacer esto directamente (lo impide la seguridad RLS).' },
    ],
  },
]

const STACK = [
  { name: 'Next.js 14 (App Router)', icon: <StackGlyph />, why: 'Framework fullstack de React. Une la vista y los endpoints API en un mismo proyecto y se despliega directo en Vercel.' },
  { name: 'TypeScript estricto', icon: <CodeGlyph />, why: 'JavaScript con tipos y verificación estricta (sin variables ni parámetros sin usar): menos errores y código más mantenible.' },
  { name: 'Tailwind CSS', icon: <BookGlyph />, why: 'Estilos por utilidades. El tema neomórfico oscuro se arma con clases y unas cuantas reglas propias (neo-*).' },
  { name: 'Supabase', icon: <DbGlyph />, why: 'PostgreSQL gestionado con autenticación, tiempo real y almacenamiento. La seguridad vive en la base (RLS), no solo en la app.' },
  { name: 'Ollama + Llama 3', icon: <ChipGlyph />, why: 'Motor de IA local. Corre el modelo Llama 3.2 en la máquina: privado, gratis por consulta y sin depender de la nube.' },
  { name: 'Vercel', icon: <RocketGlyph />, why: 'Hospedaje con despliegue continuo: cada push a GitHub reconstruye y publica la web automáticamente.' },
]

const TABLES = [
  { name: 'profiles', desc: 'Usuarios y su rol (catedrático / estudiante / visitante), nombre y avatar.' },
  { name: 'classes', desc: 'Clases del catedrático: código, período, modalidad de grupos y cupo máximo por equipo.' },
  { name: 'enrollments', desc: 'Inscripción: qué estudiante pertenece a qué clase.' },
  { name: 'class_groups', desc: 'Grupos (escuadrones) de una clase: nombre y emblema.' },
  { name: 'group_members', desc: 'Integrantes de cada grupo y quién es el líder.' },
  { name: 'projects', desc: 'Proyectos: título, enunciado (PDF/link), requisitos, rúbrica y parcial (1/2/3/final).' },
  { name: 'group_projects', desc: 'Qué proyecto tiene asignado cada grupo.' },
  { name: 'kanban_tasks', desc: 'Tarjetas del tablero de cada grupo (Por hacer / En progreso / Hecho).' },
  { name: 'group_evaluations', desc: 'La evaluación por rúbrica y la nota de cada grupo.' },
  { name: 'messages', desc: 'Chat en tiempo real por grupo/aula (vía Realtime).' },
  { name: 'community_messages', desc: 'Chat de la comunidad general.' },
]

const AI_FLOW = [
  { title: 'El usuario escribe un comando', desc: 'Ej. "crea una clase de Redes" o "¿quién no ha entregado?". La app toma el texto tal cual.' },
  { title: 'La app arma el contexto (RAG)', desc: 'getAssistantContext() genera un resumen real de la clase (estudiantes, grupos, proyectos) para dárselo a la IA.' },
  { title: 'POST /api/assistant', desc: 'El endpoint manda a Ollama: la pregunta + el contexto + las herramientas disponibles, con temperatura baja.' },
  { title: 'Llama responde', desc: 'Devuelve TEXTO (si es una consulta) o un TOOL_CALL (si quiere crear/eliminar algo).' },
  { title: 'Si es acción: tarjeta de confirmación', desc: 'La app NO ejecuta sola. Muestra qué hará y espera tu OK (eliminar se marca en rojo).' },
  { title: 'Se ejecuta con tus permisos', desc: 'Al confirmar, la función real corre desde el navegador autenticado como tú, respetando la seguridad (RLS).' },
]

const SAFEGUARDS = [
  { name: 'Dato pendiente (determinista)', icon: <CheckGlyph />, why: 'Si falta un dato (ej. el nombre), la app lo pregunta y usa tu respuesta directa como valor, sin depender del modelo. 100% confiable.' },
  { name: 'Corrección por verbo', icon: <CheckGlyph />, why: 'Si dices "crea" pero el modelo elige "eliminar" (o al revés), la app lo corrige según tu verbo.' },
  { name: 'Aviso de duplicado', icon: <CheckGlyph />, why: 'Si la clase ya existe (o no existe para crear grupos), avisa antes de confirmar.' },
  { name: 'Sin historial al modelo', icon: <CheckGlyph />, why: 'Cada comando se manda solo, sin arrastrar los anteriores, para que el modelo pequeño no se ancle a lo previo.' },
  { name: 'Confirmación siempre', icon: <CheckGlyph />, why: 'Ninguna acción se ejecuta sin tu OK; las destructivas (eliminar) se resaltan en rojo.' },
  { name: 'Historial local', icon: <CheckGlyph />, why: 'Las conversaciones se guardan en el navegador (localStorage), como un chatbot normal.' },
]

const ENV = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', val: 'https://...supabase.co', note: 'URL del proyecto Supabase.' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', val: 'eyJ...', note: 'Clave pública (anon) para el cliente.' },
  { key: 'OLLAMA_BASE_URL', val: 'http://localhost:11434', note: 'Servidor de Ollama. Cambiarlo mueve la IA a otro servidor sin tocar código.' },
  { key: 'OLLAMA_MODEL', val: 'llama3.2', note: 'Modelo a usar. Se puede cambiar a uno más grande.' },
]

const GLOSSARY = [
  { term: 'Aula', def: 'El espacio de trabajo de una clase: aquí viven los proyectos, los grupos y los tableros.' },
  { term: 'Escuadrón / Grupo', def: 'Equipo de estudiantes que trabaja un proyecto. Tiene nombre, emblema y un líder.' },
  { term: 'Parcial', def: 'Período de evaluación (1, 2, 3 o final). Cada proyecto pertenece a un parcial.' },
  { term: 'Rúbrica', def: 'Los criterios con los que el catedrático califica una entrega.' },
  { term: 'Enunciado', def: 'La consigna del proyecto: puede ser un PDF, un link (Overleaf/Drive) o texto.' },
  { term: 'Kanban', def: 'Tablero de tareas con columnas Por hacer, En progreso y Hecho.' },
  { term: 'Auto-inscripción', def: 'Modalidad donde los estudiantes eligen su grupo (con cupo), en vez de que el profe asigne.' },
  { term: 'Entregable', def: 'El resultado del proyecto: repositorio, despliegue y video de demostración.' },
  { term: 'Asistente IA', def: 'El orbe flotante con IA que consulta datos y ejecuta acciones por lenguaje natural.' },
]

const FAQ = [
  { q: '¿Cómo se inscriben mis estudiantes a la clase?', a: 'Comparte el código de la clase (aparece en Mis Clases). El estudiante lo escribe en su panel y queda inscrito automáticamente.' },
  { q: '¿Puedo subir el enunciado como PDF, igual que un ingeniero?', a: 'Sí. Al crear un proyecto puedes subir un PDF, pegar un link (por ejemplo de Overleaf o Drive) o escribir el texto directamente. También defines requisitos y rúbrica.' },
  { q: '¿Los estudiantes pueden cambiarse de grupo?', a: 'En auto-inscripción, al unirse a un grupo quedan fijos (bloqueo) para evitar desorden. El catedrático puede reorganizar si lo necesita.' },
  { q: '¿El catedrático puede editar el trabajo de un grupo?', a: 'No. La vista del catedrático sobre el tablero y la entrega de un grupo es de solo lectura: supervisa y evalúa, pero no hace las tareas por ellos.' },
  { q: '¿La IA manda mis datos a internet?', a: 'No. El asistente corre local con Ollama; los datos de la clase no salen de la máquina. Solo responde con base en tus datos reales.' },
  { q: '¿La IA puede borrar cosas por error?', a: 'Ninguna acción se ejecuta sola: siempre te muestra una tarjeta de confirmación, y las acciones destructivas (eliminar) se marcan en rojo.' },
]

type Concept = { term: string; detail: string; icon: React.ReactNode }
const CONCEPTS: Concept[] = [
  { term: 'Fullstack (Next.js)', detail: 'Frontend y backend en un mismo proyecto. Las paginas y las API (endpoints) conviven en la carpeta app/.', icon: <StackGlyph /> },
  { term: 'Supabase / RLS', detail: 'PostgreSQL gestionado con autenticacion, tiempo real y seguridad a nivel de fila: cada quien ve/edita solo lo suyo.', icon: <DbGlyph /> },
  { term: 'RAG', detail: 'Retrieval-Augmented Generation: se le dan datos reales a la IA como contexto para que responda con hechos, no invente.', icon: <DataGlyph /> },
  { term: 'Agéntico (tool-calling)', detail: 'La IA no solo habla: tiene herramientas (crear/eliminar) y decide cual usar segun el comando. Siempre con confirmacion.', icon: <SparkGlyph /> },
  { term: 'Ollama + Llama 3', detail: 'Modelo de IA open-source corriendo local. Privado (no manda datos a la nube) y gratis por consulta.', icon: <ChipGlyph /> },
  { term: 'TypeScript estricto', detail: 'JavaScript con tipos y verificacion estricta: menos errores en tiempo de ejecucion, codigo mas mantenible.', icon: <CodeGlyph /> },
]

/* ─────────────── ICONOS (SVG, sin emojis) ─────────────── */

function G({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
function SparkGlyph() { return <G><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" /></G> }
function DataGlyph() { return <G><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></G> }
function ShieldGlyph() { return <G><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></G> }
function FolderGlyph() { return <G><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></G> }
function TerminalGlyph() { return <G><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></G> }
function BookGlyph() { return <G><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /></G> }
function PlayGlyph() { return <G><circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4z" /></G> }
function StackGlyph() { return <G><path d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></G> }
function DbGlyph() { return <G><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /></G> }
function ChipGlyph() { return <G><rect x="6" y="6" width="12" height="12" rx="1" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></G> }
function CodeGlyph() { return <G><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" /></G> }
function HelpGlyph() { return <G><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><path d="M12 17h.01" /></G> }
function RocketGlyph() { return <G><path d="M12 2c3 1 5 4 5 8l-2 4H9L7 10c0-4 2-7 5-8z" /><path d="M9 16l-2 4M15 16l2 4M12 11h.01" /></G> }
function CheckGlyph() { return <G><path d="M20 6L9 17l-5-5" /></G> }
