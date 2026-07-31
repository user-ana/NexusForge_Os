'use client'

import NexusAssistant from '@/frontend/components/assistant/NexusAssistant'

/**
 * Página inmersiva del asistente Nexus: chat + robot animado + voz + traducción
 * en vivo + análisis de archivos e imágenes. Se ramifica por rol (catedrático =
 * gestión, estudiante = estudio) dentro del propio componente.
 */
export default function AsistentePage() {
  return <NexusAssistant />
}
