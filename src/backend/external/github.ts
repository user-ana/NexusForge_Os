/**
 * Auto-importar datos de una entrega desde un repositorio público de GitHub.
 * Usa la API pública (sin token: 60 req/hora por IP, suficiente para el aula).
 * Con solo el enlace del repo llenamos título, descripción (del README) y despliegue.
 */

export type GithubRepoInfo = {
  name: string
  description: string
  homepage: string
  readme: string
}

/** Extrae {owner, repo} de una URL de GitHub. Devuelve null si no es válida. */
export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') }
  } catch {
    return null
  }
}

/** Decodifica el base64 del README respetando UTF-8 (acentos, ñ, etc.). */
function decodeBase64Utf8(b64: string): string {
  try {
    const bin = atob(b64.replace(/\s/g, ''))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

/**
 * Convierte el README (Markdown) en un resumen legible en texto plano:
 * quita insignias/imágenes, enlaces (deja el texto), encabezados, HTML y
 * bloques de código. Devuelve los primeros párrafos con sentido.
 */
export function readmeToSummary(md: string, maxChars = 600): string {
  let s = md
  s = s.replace(/```[\s\S]*?```/g, ' ') // bloques de código
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // imágenes / insignias
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // enlaces -> texto
  s = s.replace(/<[^>]+>/g, ' ') // HTML
  s = s.replace(/^#{1,6}\s+/gm, '') // encabezados
  s = s.replace(/[*_`>|]+/g, '') // marcas sueltas de markdown
  s = s.replace(/^\s*[-+]\s+/gm, '• ') // viñetas
  const paras = s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
  let out = ''
  for (const p of paras) {
    if (out && (out + ' ' + p).length > maxChars) break
    out = out ? `${out}\n\n${p}` : p
    if (out.length >= maxChars) break
  }
  if (out.length > maxChars) out = out.slice(0, maxChars).trimEnd() + '…'
  return out.trim()
}

/** Convierte "mi-proyecto-genial" en "Mi Proyecto Genial". */
export function prettifyRepoName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Consulta el repo y su README. Devuelve null si el repo no es público o no existe. */
export async function fetchGithubRepo(url: string): Promise<GithubRepoInfo | null> {
  const parsed = parseGithubRepo(url)
  if (!parsed) return null
  const { owner, repo } = parsed
  const headers = { Accept: 'application/vnd.github+json' }

  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
  if (!repoRes.ok) return null
  const data = await repoRes.json()

  let readme = ''
  try {
    const rmRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers })
    if (rmRes.ok) {
      const rm = await rmRes.json()
      if (rm?.content) readme = decodeBase64Utf8(rm.content)
    }
  } catch {
    // sin README: seguimos solo con la descripción del repo
  }

  return {
    name: typeof data.name === 'string' ? data.name : repo,
    description: typeof data.description === 'string' ? data.description : '',
    homepage: typeof data.homepage === 'string' ? data.homepage : '',
    readme,
  }
}
