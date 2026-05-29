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
        // Neutrala designtokens (DESIGN.md sek 3.1) — nordisk-sober palett.
        ink: { DEFAULT: '#1a2332', 2: '#4a5568', 3: '#8b95a5' },
        line: { DEFAULT: '#e4e7eb', 2: '#eef0f3' },
        surface: { DEFAULT: '#fafbfc', 2: '#ffffff' },
      },
    },
  },
  plugins: [],
};
