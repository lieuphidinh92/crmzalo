/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#08213A',
          900: '#0A2540',
          800: '#0F2D4D',
          700: '#13365C',
        },
        royal: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          600: '#2563EB',
          700: '#1E40AF',
          800: '#1E3A8A',
        },
        amber: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
        },
        surface: {
          0: '#FFFFFF',
          50: '#F8FAFC',
          soft: '#F1F5F9',
        },
        ink: {
          primary: '#0F172A',
          secondary: '#64748B',
          disabled: '#94A3B8',
        },
        line: {
          200: '#E2E8F0',
          300: '#CBD5E1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Nunito', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 8px 24px rgba(15,23,42,.06)',
        pop: '0 16px 40px rgba(15,23,42,.12)',
        fab: '0 8px 20px rgba(30,64,175,.35)',
      },
      borderRadius: {
        card: '16px',
        btn: '12px',
        input: '12px',
        modal: '16px',
      },
    },
  },
  plugins: [],
};
