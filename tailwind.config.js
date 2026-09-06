/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        }
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'soft': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'bounce-sm': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms'
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' }
        },
        subtlePulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.88', transform: 'scale(1.02)' }
        }
      },
      animation: {
        'shimmer': 'shimmer 2.8s infinite ease-in-out',
        'subtle-pulse': 'subtlePulse 3s infinite ease-in-out'
      }
    },
  },
  plugins: [],
};
