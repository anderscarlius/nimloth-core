/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        core: {
          navy: '#1A1A2E',
          'navy-2': '#2A2A4E',
          teal: '#0D7377',
          'teal-dark': '#0a5a5d',
          amber: '#F39C12',
          red: '#C0392B',
          green: '#27AE60',
        },
      },
    },
  },
  plugins: [],
};
