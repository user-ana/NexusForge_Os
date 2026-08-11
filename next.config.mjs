/** @type {import('next').NextConfig} */

/**
 * Cabeceras de seguridad HTTP.
 *
 * Son instrucciones que el servidor le da al navegador para cerrar ataques
 * clásicos de web. Cada una tapa un hueco distinto:
 */
const securityHeaders = [
  // Nadie puede meter mi sitio dentro de un <iframe> suyo. Evita el
  // "clickjacking": una página falsa que superpone botones invisibles sobre los
  // míos para que la persona haga clic en algo que no quería (ej. "Eliminar").
  { key: 'X-Frame-Options', value: 'DENY' },

  // El navegador respeta el tipo de archivo que yo declaro y no "adivina".
  // Sin esto, un archivo subido podría interpretarse como JavaScript y ejecutarse.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Al salir del sitio solo se manda el dominio, nunca la ruta completa. Así no
  // se filtran identificadores privados (ej. /dashboard/grupos/<id>) a terceros.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Se apagan capacidades del navegador que la plataforma no usa. Si algún día
  // se colara un script malicioso, no podría encender la cámara ni la ubicación.
  // El MICRÓFONO se permite SOLO al propio sitio (self) para el dictado por voz
  // del asistente; ningún tercero incrustado puede usarlo.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },

  // Obliga a usar siempre HTTPS durante un año. Cierra el ataque de bajar la
  // conexión a HTTP para leer el token de sesión en una red WiFi ajena.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },

  // Aísla el sitio de otras pestañas del navegador (Spectre / fugas entre origenes).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Next da 60 segundos por defecto a cada worker para recolectar los datos de
  // página, y luego lo mata con SIGTERM. En una máquina de desarrollo sobra;
  // en el servidor propio —con el modelo de IA ocupando CPU y un escritorio
  // gráfico encima— no alcanza, y la construcción falla con
  // "Collecting page data for /_app is still timing out".
  //
  // Lo que se agota no es un cálculo pesado: es esperar en una máquina cargada.
  // Cinco minutos le dan aire sin esconder un problema real, porque una
  // construcción sana termina muy por debajo de ese límite.
  staticPageGenerationTimeout: 300,
  // Permite compilar en una carpeta aparte (NEXT_DIST_DIR=.next-check) para
  // verificar que todo compila SIN pisar el .next que está usando `npm run dev`.
  // Si se pisa, el servidor de desarrollo se rompe con "Cannot find module".
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Las cabeceras se aplican a TODAS las rutas del sitio.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
