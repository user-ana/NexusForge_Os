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
 * SEGURIDAD: la clave y su hash YA NO viven en el cliente. Antes el hash
 * viajaba en el JavaScript del navegador, lo que permitía romperlo por fuerza
 * bruta sin límite y además saltarse la comprobación.
 *
 * Ahora la verificación ocurre SOLO en el servidor:
 *   POST /api/verify-teacher-key   (con límite de intentos)
 * y ese endpoint es el único que puede otorgar el rol de catedrático.
 *
 * Ver: src/app/api/verify-teacher-key/route.ts
 * ------------------------------------------------------------------ */

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
