---
noteId: "c185b3d06a7c11f1b99cada8a7b77122"
tags: []

---

# NexusForge OS - Development Guide

## Code Standards

### 1. TypeScript
- Always use `interface` for objects
- Use `type` for unions and primitives
- No `any` types - always be explicit
- Make interfaces generic when needed
- Use absolute imports with `@/` prefix

### 2. Component Structure
```tsx
// Example component structure
interface ComponentProps {
  // Props definition
}

export default function ComponentName({ prop1, prop2 }: ComponentProps) {
  // Component logic
  return (
    // JSX
  )
}
```

### 3. Naming Conventions
- Components: PascalCase (`LoginForm.tsx`)
- Files: PascalCase for components, lowercase for utils (`src/utils/helpers.ts`)
- Props: camelCase
- CSS Classes: Use Tailwind classes + custom components defined in `globals.css`
- Interfaces: PrefixedName (`LoginFormProps`)

### 4. Styling Approach
- Use Tailwind CSS first
- Create reusable component classes in `globals.css` using `@layer components`
- Custom classes available:
  - `.neo-button`, `.neo-button-primary`, `.neo-button-secondary`
  - `.neo-card`, `.neo-card-hover`
  - `.neo-input`
  - `.rank-bronze`, `.rank-silver`, `.rank-gold`, `.rank-platinum`, `.rank-diamond`
  - `.text-glow-violet`, `.text-glow-blue`, `.text-glow-cyan`
  - `.glass-effect`

### 5. Color System
Use the custom Tailwind config colors:
```tsx
// Dark backgrounds
bg-dark-0, bg-dark-1, bg-dark-2, bg-dark-3, bg-dark-4

// Text colors
text-text-primary, text-text-secondary, text-text-tertiary

// Accents
accent-violet, accent-violetBright, accent-blue, accent-blueBright
accent-cyan, accent-cyanBright

// Ranks
rank-bronze, rank-silver, rank-gold, rank-platinum, rank-diamond
```

### 6. Layout Structure
All dashboard pages should follow this structure:
```tsx
import Header from '@/components/layout/Header'

export default function PageName() {
  return (
    <>
      <Header title="Page Title" subtitle="Description" action={<Button>Action</Button>} />
      <main className="flex-1 overflow-auto p-8">
        {/* Page content */}
      </main>
    </>
  )
}
```

### 7. Responsive Design
- Mobile-first approach
- Use Tailwind breakpoints: `sm:`, `md:`, `lg:`, `xl:`
- Minimum width for cards on desktop: `min-w-80`
- Test on: Mobile (375px), Tablet (768px), Desktop (1024px+)

### 8. Accessibility
- Always use semantic HTML
- Add `aria-` attributes where needed
- Ensure color contrast meets WCAG AA
- Use labels for form inputs
- Test with keyboard navigation

### 9. Performance
- Use `next/link` for internal navigation
- Lazy load components when possible
- Optimize images
- Use React.memo for frequently rendered components
- Avoid inline function definitions in render

### 10. File Organization

```
src/
├── app/                    # Next.js app directory
│   ├── (auth)/            # Auth group routes
│   ├── dashboard/         # Dashboard routes
│   ├── gallery/           # Gallery routes
│   └── page.tsx           # Landing page
├── components/
│   ├── auth/              # Auth-specific components
│   ├── layout/            # Layout wrapper components
│   ├── ui/                # Reusable UI components
│   └── dashboard/         # Dashboard-specific components
├── lib/                   # Business logic
├── types/                 # TypeScript definitions
└── utils/                 # Helper functions
```

### 11. Common Patterns

#### Form Handling
```tsx
const [formData, setFormData] = useState({ email: '', password: '' })
const [errors, setErrors] = useState<Record<string, string>>({})

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target
  setFormData(prev => ({ ...prev, [name]: value }))
}

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  // Validation
  // API call
}
```

#### Data Display
```tsx
// Use Card component for grouped content
<Card hover rank="gold">
  <h3 className="font-bold text-text-primary">{title}</h3>
  <p className="text-text-secondary">{description}</p>
</Card>
```

### 12. Git Commit Messages
- Format: `feat/fix/docs/style: brief description`
- Examples:
  - `feat: add kanban board component`
  - `fix: correct sidebar styling`
  - `docs: update development guide`

### 13. Browser Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

### 14. Testing Guidelines
- Write tests for utilities and helpers
- Use React Testing Library for components
- Aim for 80%+ coverage on business logic

### 15. Documentation
- Document complex components with JSDoc
- Keep README updated
- Add comments for non-obvious logic
- Keep this guide updated with new standards

## Quick Commands

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start

# Linting
npm run lint

# Format code
npm run format  # To be configured
```

## Troubleshooting

### Tailwind classes not applying
- Check if class is in `content` config
- Clear `.next` folder
- Restart dev server

### Type errors
- Check TypeScript config paths
- Ensure all imports use correct paths
- Run `npm run build` to catch all errors

### Styling issues
- Inspect element in browser dev tools
- Check z-index values
- Use Tailwind's `@apply` for complex selectors
