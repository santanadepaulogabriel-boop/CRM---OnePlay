/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Roboto Mono', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        radial: 'radial-gradient(var(--tw-gradient-stops))',
        'cinema-neon':
          "linear-gradient(135deg, rgba(3, 5, 11, 0.87) 0%, rgba(6, 9, 19, 0.79) 48%, rgba(4, 6, 13, 0.88) 100%), url('/bg-cinema-neon.png')",
      },
      keyframes: {
        'enter-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'enter-zoom': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'enter-fade 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'zoom-in': 'enter-zoom 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
