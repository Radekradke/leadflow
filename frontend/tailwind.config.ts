import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: '#F6F5F2',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#15181E',
          900: '#0D1117',
          800: '#141A23',
          700: '#1C242F',
          600: '#28323F',
          400: '#5A6473',
        },
        line: '#E8E6E1',
        line2: '#DEDCD6',
        muted: '#6B7382',
        accent: {
          DEFAULT: '#0E7C66',
          600: '#0B6552',
          700: '#084E40',
          50: '#E6F2EE',
          100: '#CFE7DF',
        },
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { xl: '0.75rem', '2xl': '1rem', '3xl': '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgba(13,17,23,0.04), 0 1px 3px rgba(13,17,23,0.05)',
        'card-hover': '0 2px 4px rgba(13,17,23,0.05), 0 10px 20px rgba(13,17,23,0.07)',
        pop: '0 12px 40px rgba(13,17,23,0.16), 0 2px 8px rgba(13,17,23,0.08)',
        focus: '0 0 0 3px rgba(14,124,102,0.18)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in': { from: { transform: 'translateX(20px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        'pop-in': { from: { transform: 'scale(0.97)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease',
        'slide-in': 'slide-in 0.22s cubic-bezier(0.22,1,0.36,1)',
        'pop-in': 'pop-in 0.16s ease',
        'slide-up': 'slide-up 0.24s cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
