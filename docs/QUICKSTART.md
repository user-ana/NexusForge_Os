---
noteId: "f4b026f06a7c11f1b99cada8a7b77122"
tags: []

---

# Quick Start Guide - NexusForge OS Frontend

## Setup Inicial (5 minutos)

### 1. Instalación de Dependencias
```bash
npm instal
```

### 2. Variables de Entorno
```bash
cp .env.example .env.local
# Editar .env.local con configuración real
```

### 3. Iniciar Servidor de Desarrollo
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Estructura Quick Reference

```
src/
├── app/           # Páginas (routing automático)
├── components/    # Componentes reutilizables
├── types/         # TypeScript types
└── utils/         # Funciones helper
```

## Componentes Disponibles

### UI Components
```tsx
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'

// Uso
<Button variant="primary">Click me</Button>
<Card hover rank="gold">Content</Card>
<Input label="Email" placeholder="..." />
```

### Layout Components
```tsx
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'

// Los Sidebars se incluyen automáticamente en dashboard layout
```

## Paleta de Colores (Tailwind)

```tsx
// Fondos
bg-dark-0, bg-dark-1, bg-dark-2, bg-dark-3, bg-dark-4

// Texto
text-text-primary, text-text-secondary, text-text-tertiary

// Acentos
accent-violet, accent-violetBright, accent-blue, accent-blueBright
accent-cyan, accent-cyanBright

// Rangos
rank-bronze, rank-silver, rank-gold, rank-platinum, rank-diamond
```

## Creando una Nueva Página

### 1. Crear archivo en app/
```tsx
// src/app/dashboard/nueva-seccion/page.tsx
import Header from '@/components/layout/Header'

export default function NuevaSeccion() {
  return (
    <>
      <Header title="Nueva Sección" subtitle="Descripción" />
      <main className="flex-1 overflow-auto p-8">
        {/* Content */}
      </main>
    </>
  )
}
```

### 2. Agregar Link en Sidebar
Edit `src/components/layout/Sidebar.tsx`:
```tsx
<Link href="/dashboard/nueva-seccion">
  <div className="px-4 py-3 rounded-lg text-text-secondary hover:bg-dark-1 hover:text-accent-violet transition cursor-pointer">
    Nueva Sección
  </div>
</Link>
```

## Creando Nuevo Componente

```tsx
// src/components/ui/MiComponente.tsx
interface MiComponenteProps {
  title: string
  onClick?: () => void
}

export default function MiComponente({ title, onClick }: MiComponenteProps) {
  return (
    <div className="neo-card p-4">
      <h3 className="text-text-primary font-bold">{title}</h3>
    </div>
  )
}

// Uso
import MiComponente from '@/components/ui/MiComponente'

<MiComponente title="Mi Componente" />
```

## Styling Tips

### Clases Custom Disponibles
```tsx
// Botones
<button className="neo-button-primary">Primary</button>
<button className="neo-button-secondary">Secondary</button>

// Tarjetas
<div className="neo-card">Content</div>
<div className="neo-card-hover">Hover effect</div>

// Inputs
<input className="neo-input" />

// Efectos glow
<div className="shadow-glow-violet">Violet Glow</div>
<div className="shadow-glow-blue">Blue Glow</div>
<div className="shadow-glow-cyan">Cyan Glow</div>
```

### Responsive Design
```tsx
// Mobile-first
<div className="text-sm md:text-base lg:text-lg">
  Responsive text
</div>

// Grid responsivo
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Items */}
</div>
```

## Funciones Helper Útiles

```tsx
import {
  getProjectRank,
  formatDate,
  formatTime,
  getInitials,
  truncateText,
  cn,
} from '@/utils/helpers'

getProjectRank(512) // 'gold'
formatDate(new Date()) // 'Dec 17, 2024'
getInitials('John', 'Doe') // 'JD'
truncateText('Long text', 10) // 'Long tex...'
```

## Verificación de Código

```bash
# Build (verifica TypeScript)
npm run build

# Lint
npm run lint
```

## Documentación

- **Setup completo**: Ver `README.md`
- **Estándares de código**: Ver `DEVELOPMENT.md`
- **Estado del proyecto**: Ver `PROGRESS.md`

## Próximos Pasos (Backend Integration)

1. Conectar Supabase para autenticación
2. Configurar Socket.IO para chat en vivo
3. Crear hooks de API
4. Implementar estado global (Context/Redux)
5. Testing de componentes

## Troubleshooting

### Tailwind no aplica estilos
```bash
# Limpiar caché
rm -rf .next
npm run dev
```

### TypeScript errors
```bash
npm run build
# Muestra todos los errores
```

### Puerto 3000 en uso
```bash
npm run dev -- -p 3001
# Usa puerto 3001
```

## Recursos

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [TypeScript](https://www.typescriptlang.org)
- [React](https://react.dev)

---

**Happy Coding!** Recuerda revisar `DEVELOPMENT.md` para estándares de código.
