---
noteId: "0136c9606a7d11f1b99cada8a7b77122"
tags: []

---

# NexusForge OS - Project Index

## Documentación Principal

| Documento | Propósito |
|-----------|-----------|
| `README.md` | Setup, descripción del proyecto, tech stack |
| `QUICKSTART.md` | Guía rápida de inicio |
| `DEVELOPMENT.md` | Estándares de código y convenciones |
| `PROGRESS.md` | Reporte de completitud del MVP |
| `infoNexusForge_Os.md` | Especificaciones técnicas y funcionales |

## Estructura de Carpetas

### `/src/app/` - Páginas y Routing

```
app/
├── page.tsx                    # Landing page (/)
├── layout.tsx                  # Layout raíz
├── globals.css                 # Estilos globales
│
├── auth/
│   ├── login/page.tsx         # (/auth/login)
│   └── signup/page.tsx        # (/auth/signup)
│
├── dashboard/                  # Panel principal
│   ├── layout.tsx             # Layout con sidebar
│   ├── page.tsx               # Dashboard (/dashboard)
│   ├── classes/
│   │   └── page.tsx           # (/dashboard/classes)
│   ├── groups/
│   │   ├── page.tsx           # (/dashboard/groups)
│   │   └── [id]/page.tsx      # (/dashboard/groups/:id) - Kanban
│   ├── projects/
│   │   └── page.tsx           # (/dashboard/projects)
│   └── settings/
│       └── page.tsx           # (/dashboard/settings)
│
└── gallery/
    └── page.tsx               # (/gallery) - Proyectos públicos
```

### `/src/components/` - Componentes Reutilizables

```
components/
├── auth/                       # Componentes de autenticación
│   └── [componentes futuros]
│
├── layout/                     # Componentes de estructura
│   ├── Sidebar.tsx            # Navegación izquierda
│   └── Header.tsx             # Encabezado de página
│
└── ui/                         # Componentes UI reutilizables
    ├── Button.tsx             # Botones (4 variantes)
    ├── Card.tsx               # Tarjetas
    ├── Input.tsx              # Inputs con validación
    ├── Avatar.tsx             # Avatares de usuario
    ├── Badge.tsx              # Badges de estado
    ├── TaskCard.tsx           # Tarjetas de tareas
    └── KanbanColumn.tsx       # Columnas del Kanban
```

### `/src/types/` - Definiciones TypeScript

```
types/
└── index.ts                    # Todas las interfaces:
    ├── User (roles: teacher, student, guest)
    ├── Class
    ├── Group
    ├── Task (status: TODO, DOING, DONE)
    ├── Project (con rangos)
    ├── Comment
    └── Vote
```

### `/src/utils/` - Funciones Helper

```
utils/
└── helpers.ts                  # Funciones utilitarias:
    ├── getProjectRank()
    ├── formatDate()
    ├── formatTime()
    ├── getInitials()
    ├── truncateText()
    └── cn()
```

### `/src/lib/` - Lógica de Negocio

```
lib/
└── [Pendiente integración backend]
    ├── api.ts                  # Llamadas API
    ├── auth.ts                 # Autenticación
    └── socket.ts               # WebSocket
```

## Configuración del Proyecto

| Archivo | Propósito |
|---------|-----------|
| `package.json` | Dependencias y scripts |
| `tsconfig.json` | Configuración TypeScript |
| `tailwind.config.ts` | Tema y extensiones Tailwind |
| `next.config.ts` | Configuración Next.js |
| `postcss.config.js` | Procesamiento CSS |
| `.env.example` | Variables de entorno template |
| `.gitignore` | Archivos ignorados en git |

## Mapa Visual de Rutas

```
/                                    Landing
├── /auth
│   ├── /login                       Iniciar sesión
│   └── /signup                      Registrarse
│
└── /dashboard                       Panel principal
    ├── /classes                     Mis clases
    ├── /groups                      Mis equipos
    │   └── /[id]                    Kanban del equipo
    ├── /projects                    Mis proyectos
    ├── /settings                    Configuración
    └── (default)                    Dashboard

/gallery                             Galería pública
```

## Componentes por Ubicación

### En Todos lados
- `Sidebar` - Navegación
- `Header` - Encabezado de sección

### Dashboard
- `Button` - Acciones
- `Card` - Contenedores
- `Input` - Formularios
- `Avatar` - Usuarios
- `Badge` - Estado
- `KanbanColumn` - Tareas
- `TaskCard` - Items Kanban

## Paleta de Colores Quick Reference

### Fondos
```
bg-dark-0    #0B0E14   Negro profundo
bg-dark-1    #151A22   Negro oscuro
bg-dark-2    #1F2937   Gris oscuro
bg-dark-3    #2D3748   Gris medio
bg-dark-4    #374151   Gris claro
```

### Texto
```
text-text-primary     #E2E8F0   Blanco suave
text-text-secondary   #CBD5E1   Gris claro
text-text-tertiary    #94A3B8   Gris medio
```

### Acentos
```
accent-violet         #A78BFA   Morado principal
accent-violetBright   #C084FC   Morado claro
accent-blue           #60A5FA   Azul
accent-blueBright     #3B82F6   Azul claro
accent-cyan           #06B6D4   Cian
accent-cyanBright     #00D9FF   Cian claro
```

### Rangos (Gamificación)
```
rank-bronze           #D97706   Bronce
rank-silver           #A3A3A3   Plata
rank-gold             #FBBF24   Oro
rank-platinum         #00E5FF   Platino
rank-diamond          #00D9FF   Diamante
```

## Clases CSS Custom

En `src/app/globals.css`:

```css
/* Componentes */
.neo-button              /* Botón base */
.neo-button-primary      /* Botón primario */
.neo-button-secondary    /* Botón secundario */
.neo-button-danger       /* Botón peligroso */
.neo-card                /* Tarjeta base */
.neo-card-hover          /* Tarjeta con hover */
.neo-input               /* Input base */

/* Efectos */
.shadow-glow-violet      /* Resplandor violeta */
.shadow-glow-blue        /* Resplandor azul */
.shadow-glow-cyan        /* Resplandor cian */
.glass-effect            /* Efecto vidrio */

/* Rangos */
.rank-bronze             /* Borde bronce */
.rank-silver             /* Borde plata */
.rank-gold               /* Borde oro */
.rank-platinum           /* Borde platino */
.rank-diamond            /* Borde diamante */
```

## Workflow de Desarrollo Típico

### Crear Nueva Página
1. Crear carpeta en `/src/app`
2. Crear `page.tsx`
3. Importar `Header` de layout
4. Usar componentes UI de `@/components/ui`
5. Agregar ruta en `Sidebar.tsx`

### Crear Nuevo Componente
1. Crear archivo en `/src/components/ui` o categoria apropiada
2. Exportar con nombres en PascalCase
3. Usar tipos TypeScript para props
4. Documentar con JSDoc si es complejo
5. Importar en donde sea necesario

### Estilizar
1. Usar clases Tailwind primero
2. Si es reutilizable, agregar a `globals.css`
3. Usar colores del config custom
4. Mantener consistencia con paleta

## Comandos Útiles

```bash
npm run dev              # Desarrollar (puerto 3000)
npm run build            # Build de producción
npm start                # Ejecutar producción
npm run lint             # Linter (cuando esté configurado)
```

## TODO - Próximos Pasos

### Fase 2: Integración Backend
- [ ] Conectar Supabase auth
- [ ] Configurar Socket.IO
- [ ] Crear API client hooks
- [ ] Implementar Context/Redux
- [ ] Formularios con validación

### Fase 3: Funcionalidades Avanzadas
- [ ] Chat en tiempo real
- [ ] Notificaciones
- [ ] Comentarios en proyectos
- [ ] Sistema de votos
- [ ] Cálculo de rangos

### Fase 4: Optimización
- [ ] Tests unitarios
- [ ] E2E testing
- [ ] Performance optimization
- [ ] SEO improvements
- [ ] PWA setup

## Contacto y Referencia

- **Especificaciones**: `infoNexusForge_Os.md`
- **Código**: Este archivo actualiza la estructura
- **Preguntas**: Ver `DEVELOPMENT.md`

---

**Última actualización**: Diciembre 17, 2024
**Status**: MVP Frontend Completado ✓
