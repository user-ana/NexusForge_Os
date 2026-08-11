/**
 * Configuración compartida del servidor de IA (Ollama).
 *
 * Está aparte porque las tres rutas que hablan con el modelo (asistente,
 * resumen de PDF y tutor) leían las mismas variables por su cuenta: al ajustar
 * el rendimiento había que tocar tres archivos y era fácil dejar uno atrás.
 */

/** URL del servidor de IA. En local, Ollama escucha en el 11434. */
export function ollamaBase(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
}

/** Modelo a usar. llama3.2 (3B) cabe en GPUs de ~6 GB. */
export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || 'llama3.2'
}

/**
 * Cabeceras para hablar con el servidor de IA.
 *
 * Ollama NO tiene autenticación: quien alcance el puerto puede usar la GPU
 * para lo que quiera, y además borrar o descargar modelos. Mientras vive en
 * `localhost` o en la red de casa da igual, pero en cuanto se publica por un
 * túnel para que otros lo prueben, deja de dar igual.
 *
 * Por eso delante va `scripts/ollama-proxy.mjs`, que exige este token y solo
 * deja pasar las rutas de lectura y generación. Si OLLAMA_AUTH_TOKEN no está
 * definida, no se manda nada y todo funciona igual que antes: en local no
 * hace falta.
 */
export function ollamaHeaders(): Record<string, string> {
  const token = process.env.OLLAMA_AUTH_TOKEN
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Modelo con VISIÓN, para cuando el estudiante adjunta una captura
 * (OLLAMA_VISION_MODEL, p. ej. 'moondream' o 'llava'). El modelo de texto no
 * puede leer imágenes, así que sin esta variable esa función queda apagada
 * y se avisa en pantalla en vez de fallar en silencio.
 */
export function ollamaVisionModel(): string {
  return process.env.OLLAMA_VISION_MODEL || ''
}

/**
 * Hilos de CPU que puede usar el modelo (OLLAMA_NUM_THREAD).
 *
 * Sin la variable, Ollama decide solo — que es lo correcto cuando corre en GPU.
 * Solo conviene fijarlo cuando corre en CPU, y entonces el número que rinde es
 * el de núcleos FÍSICOS: pasarse de ahí hace que los hilos se peleen entre sí y
 * la respuesta sale más lenta, no más rápida.
 */
export function ollamaThreads(): number | undefined {
  const n = parseInt(process.env.OLLAMA_NUM_THREAD ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Arma las `options` de la petición sumándole el número de hilos si está
 * configurado. Así ninguna ruta tiene que acordarse de hacerlo.
 */
export function ollamaOptions(base: Record<string, unknown>): Record<string, unknown> {
  const threads = ollamaThreads()
  return threads ? { ...base, num_thread: threads } : base
}
