import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B1B2B', mist: '#F2F5F7', line: '#DDE3E8', teal: { DEFAULT: '#0F766E', dark: '#0B5C56', soft: '#E3F3F1' },
        amber: { DEFAULT: '#F2A516' },
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
