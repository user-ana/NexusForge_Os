/**
 * Materia de una clase, deducida de su nombre.
 *
 * Nexus lee el nombre y deduce la materia; de ahí sale el icono con el que se
 * pinta la clase en el panel. La deducción es determinista: una clase siempre
 * se ve igual, y no hace falta guardar nada en la base de datos.
 *
 * Deliberadamente NO hay color por materia: toda la interfaz va en el cian de
 * la marca sobre negro mate. Meter un color por asignatura sacaba verdes y
 * morados que no pertenecen a la paleta. La materia se distingue por el icono.
 *
 * Nota: las tarjetas van sin fondo de imagen a propósito. Si algún día se
 * quiere portada por clase, el sitio para engancharla es este archivo (un campo
 * más en Subject o una columna `cover_url` en `classes`), porque toda la app
 * pide la identidad por subjectFor().
 */

export type SubjectId = 'data' | 'web' | 'code' | 'network' | 'ai' | 'system' | 'math' | 'general'

export type Subject = {
  id: SubjectId
  /** Palabras que disparan esta materia (sin tildes, en minúscula). */
  keywords: string[]
}

export const SUBJECTS: Subject[] = [
  {
    id: 'data',
    keywords: ['base de datos', 'bases de datos', 'database', 'sql', 'datos', 'almacen', 'informacion'],
  },
  {
    id: 'web',
    keywords: ['web', 'frontend', 'front end', 'html', 'css', 'javascript', 'internet', 'sitio', 'aplicaciones web'],
  },
  {
    id: 'code',
    keywords: ['programacion', 'programming', 'algoritmo', 'algoritmos', 'codigo', 'estructura de datos', 'lenguaje', 'java', 'python', 'poo', 'objetos'],
  },
  {
    id: 'network',
    keywords: ['red', 'redes', 'network', 'iot', 'internet de las cosas', 'telecomunicaciones', 'sensores', 'distribuidos', 'nube', 'cloud'],
  },
  {
    id: 'ai',
    keywords: ['inteligencia artificial', 'ia', 'ai', 'machine learning', 'aprendizaje', 'neuronal', 'mineria', 'ciencia de datos', 'analitica'],
  },
  {
    id: 'system',
    keywords: ['sistema', 'sistemas', 'arquitectura', 'operativo', 'ingenieria de software', 'abiertos', 'infraestructura', 'devops', 'servidor'],
  },
  {
    id: 'math',
    keywords: ['matematica', 'matematicas', 'calculo', 'algebra', 'estadistica', 'discreta', 'logica', 'fisica', 'probabilidad'],
  },
  {
    id: 'general',
    keywords: ['introduccion', 'informatica', 'computacion', 'fundamentos', 'proyecto', 'seminario', 'taller'],
  },
]

const FALLBACK = SUBJECTS[SUBJECTS.length - 1]

/** Quita tildes y baja a minúsculas para comparar sin sorpresas. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Reparto estable cuando el nombre no dice nada: la misma clase, el mismo color. */
function hashPick(seed: string): Subject {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return SUBJECTS[h % SUBJECTS.length]
}

/**
 * La materia que le toca a una clase.
 * Gana la palabra clave más larga que aparezca en el nombre (así "bases de
 * datos" le gana a "datos" y no se cuela la identidad genérica).
 */
export function subjectFor(className: string, seed = className): Subject {
  const name = normalize(className)
  if (!name.trim()) return FALLBACK

  let best: Subject | null = null
  let bestLen = 0
  for (const subject of SUBJECTS) {
    for (const kw of subject.keywords) {
      if (kw.length > bestLen && name.includes(kw)) {
        best = subject
        bestLen = kw.length
      }
    }
  }
  return best ?? hashPick(seed)
}
