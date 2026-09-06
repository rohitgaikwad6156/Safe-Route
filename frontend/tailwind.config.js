/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        background: '#0b0f19',
        surface: '#111827',
        'surface-elevated': '#1e293b',
        'surface-card': 'rgba(15, 23, 42, 0.95)',
        border: '#1f293d',
        'border-light': '#334155',
        brand: {
          50: '#ecfeff',
          500: '#06b6d4',
          600: '#0891b2',
        },
        safepath: {
          safest: '#2dd4bf',   // High-luminance Teal (vivid & distinct for deuteranopes/protanopes)
          balanced: '#f59e0b', // Warm Amber/Gold
          fastest: '#38bdf8',  // Sky / Ultramarine Blue
        },
        safety: {
          low: '#f43f5e',
          medium: '#f59e0b',
          high: '#2dd4bf',
        }
      },
      boxShadow: {
        'glow-safest': '0 0 25px -2px rgba(45, 212, 191, 0.5)',
        'glow-fastest': '0 0 25px -2px rgba(56, 189, 248, 0.5)',
        'glow-balanced': '0 0 25px -2px rgba(245, 158, 11, 0.5)',
        'glow-card': '0 12px 32px -8px rgba(0, 0, 0, 0.8)',
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
