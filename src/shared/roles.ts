/**
 * Código de docente: se genera AUTOMÁTICO y ÚNICO al registrarse como catedrático.
 * Es su identificador único en el ecosistema (no un secreto que teclee).
 */
export function generateTeacherCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]
  return `DOC-${s}`
}

/* ------------------------------------------------------------------ *
 * Clave institucional de catedrático (candado del rol docente)
 *
 * Para registrarse como Catedrático hay que escribir una clave que la
 * universidad/admin reparte a los profes. Así un estudiante no puede
 * auto-asignarse el rol docente.
 *
 * Guardamos solo el HASH SHA-256 de las claves válidas — el texto plano
 * NUNCA está en el código, así que nadie puede sacarlo del bundle.
 *
 * Clave por defecto: "UTH-DOCENTE-2026"  ← cámbiala en producción:
 *   1) elige tu clave secreta
 *   2) genera su hash:  printf 'TU-CLAVE' | sha256sum
 *   3) reemplaza el hash de abajo (o añade más, separados por coma)
 *
 * NOTA: esto es una barrera del lado del cliente (suficiente para el MVP).
 * Lo ideal a futuro: validar la clave en el servidor (Supabase function/
 * tabla con RLS) para que ni el hash viaje al navegador.
 * ------------------------------------------------------------------ */
const VALID_TEACHER_HASHES = new Set<string>([
  // SHA-256 de "UTH-DOCENTE-2026"
  'b3b51fce08a232bd48de61fd8b746d0dfc7e1424507e1950ef0eaf798450da19',
])

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** ¿La clave que escribió coincide con una clave docente válida? */
export async function isValidTeacherKey(key: string): Promise<boolean> {
  const norm = key.trim().toUpperCase()
  if (!norm) return false
  try {
    const hex = await sha256Hex(norm)
    return VALID_TEACHER_HASHES.has(hex)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * Verificación de estudiante (correo institucional + número de cuenta)
 *
 * En UTH cada estudiante recibe un correo @uth.hn y un número de cuenta
 * (ej. 202120030068, donde los primeros dígitos son el año de ingreso).
 * Solo correos institucionales pueden registrarse como estudiante.
 * ------------------------------------------------------------------ */
export const STUDENT_EMAIL_DOMAIN = 'uth.hn'

/** ¿El correo es institucional (@uth.hn)? */
export function isInstitutionalEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`)
}

/** Número de cuenta válido: solo dígitos, longitud razonable (varía por año). */
export function isValidAccount(num: string): boolean {
  return /^\d{8,14}$/.test(num.trim())
}

/** Año de ingreso a partir del número de cuenta (primeros 4 dígitos), si aplica. */
export function accountYear(num: string): string | null {
  const m = num.trim().match(/^(19|20)\d{2}/)
  return m ? m[0] : null
}
