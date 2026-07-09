import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/frontend/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          0: '#0B0E14',
          1: '#151A22',
          2: '#1F2937',
          3: '#2D3748',
          4: '#374151',
        },
        text: {
          primary: '#E2E8F0',
          secondary: '#CBD5E1',
          tertiary: '#94A3B8',
        },
        accent: {
          violet: '#A78BFA',
          violetBright: '#C084FC',
          blue: '#60A5FA',
          blueBright: '#3B82F6',
          cyan: '#06B6D4',
          cyanBright: '#00D9FF',
        },
        rank: {
          bronze: '#D97706',
          silver: '#A3A3A3',
          gold: '#FBBF24',
          platinum: '#00E5FF',
          diamond: '#00D9FF',
        },
      },
      backgroundImage: {
        'gradient-dark': 'linear-gradient(135deg, #0B0E14 0%, #1F2937 100%)',
        'gradient-accent': 'linear-gradient(135deg, #A78BFA 0%, #60A5FA 100%)',
        'glow-violet': 'radial-gradient(circle, rgba(167, 139, 250, 0.2) 0%, transparent 70%)',
        'glow-blue': 'radial-gradient(circle, rgba(96, 165, 250, 0.2) 0%, transparent 70%)',
      },
      boxShadow: {
        'neo-sm': 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)',
        'neo-md': 'inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.5)',
        'neo-lg': 'inset 0 2px 12px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.6)',
        'glow-violet': '0 0 20px rgba(167, 139, 250, 0.3), 0 0 40px rgba(192, 132, 252, 0.2)',
        'glow-blue': '0 0 20px rgba(96, 165, 250, 0.3), 0 0 40px rgba(59, 130, 246, 0.2)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.3), 0 0 40px rgba(0, 217, 255, 0.2)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
}

export default config
