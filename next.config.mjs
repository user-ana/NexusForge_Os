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
  // se colara un script malicioso, no podría encender la cámara ni el micrófono.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },

  // Obliga a usar siempre HTTPS durante un año. Cierra el ataque de bajar la
  // conexión a HTTP para leer el token de sesión en una red WiFi ajena.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },

  // Aísla el sitio de otras pestañas del navegador (Spectre / fugas entre origenes).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // pdf-parse (y su motor pdfjs) es pesado y carga recursos en tiempo de
  // ejecución: lo tratamos como paquete externo del servidor para que Next no
  // intente empaquetarlo (evita fallos de "worker" en Vercel).
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  // Las cabeceras se aplican a TODAS las rutas del sitio.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
