/**
 * Parciales (períodos de evaluación dentro de una clase).
 * Un proyecto pertenece a un parcial: primero, segundo, tercero o final.
 * Cadena vacía ('') = sin parcial asignado.
 *
 * Se usa tanto en el formulario de crear proyecto como en la Vista por Períodos.
 */
export type ParcialCode = 'p1' | 'p2' | 'p3' | 'final' | ''

export type ParcialInfo = { code: ParcialCode; label: string; order: number }

/** Parciales seleccionables al crear un proyecto (sin incluir el vacío). */
export const PARCIALES: ParcialInfo[] = [
  { code: 'p1', label: 'Primer Parcial', order: 1 },
  { code: 'p2', label: 'Segundo Parcial', order: 2 },
  { code: 'p3', label: 'Tercer Parcial', order: 3 },
  { code: 'final', label: 'Final', order: 4 },
]

/** Etiqueta legible de un parcial (o "Sin parcial" si viene vacío/desconocido). */
export function parcialLabel(code: string): string {
  return PARCIALES.find((p) => p.code === code)?.label ?? 'Sin parcial'
}

/** Orden para listar los parciales (los sin parcial van al final). */
export function parcialOrder(code: string): number {
  return PARCIALES.find((p) => p.code === code)?.order ?? 99
}

/** Opciones para el selector (incluye "Sin parcial" como primera opción). */
export const PARCIAL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin parcial' },
  ...PARCIALES.map((p) => ({ value: p.code, label: p.label })),
]
