/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        // Восстанавливаем кастомную анимацию появления модалки
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0', transform: 'scale(0.95)' },
            '100%': { opacity: '1', transform: 'scale(1)' },
          }
        },
        animation: {
          'fade-in': 'fadeIn 0.2s ease-out',
        }
      },
    },
    plugins: [],
  }