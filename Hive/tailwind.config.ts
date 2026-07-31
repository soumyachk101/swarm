import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Sibling workspace packages ship React UI with Tailwind classes; scan them
    // too or their utilities (text sizes, spacing) get purged and render huge.
    '../TaskComb/src/**/*.{ts,tsx}',
    '../WorkerBees/src/ui/**/*.{ts,tsx}',
    '../WorkHive/src/ui/**/*.{ts,tsx}',
    '../QueenBee/src/ui/**/*.{ts,tsx}',
    '../BeeVoice/src/ui/**/*.{ts,tsx}',
    '../Nectar/src/ui/**/*.{ts,tsx}',
    '../HoneyBoard/src/**/*.{ts,tsx}',
    '../HivePlugins/src/**/*.{ts,tsx}',
    '../HiveExtension/src/**/*.{ts,tsx}',
    '../TaskComb/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        bee: {
          // All tokens are RGB channel CSS vars — ThemePicker swaps them live.
          canvas: "rgb(var(--bee-canvas) / <alpha-value>)",
          canvasHi: "rgb(var(--bee-canvas-hi) / <alpha-value>)",
          surface: "rgb(var(--bee-surface) / <alpha-value>)",
          surfaceHi: "rgb(var(--bee-surface-hi) / <alpha-value>)",
          border: "rgb(var(--bee-border) / <alpha-value>)",
          borderHi: "rgb(var(--bee-border-hi) / <alpha-value>)",
          gold: "rgb(var(--bee-gold) / <alpha-value>)",
          goldHi: "rgb(var(--bee-gold-hi) / <alpha-value>)",
          goldDim: "rgb(var(--bee-gold-dim) / <alpha-value>)",
          honey: "rgb(var(--bee-honey) / <alpha-value>)",
          amber: "rgb(var(--bee-amber) / <alpha-value>)",
          text: "rgb(var(--bee-text) / <alpha-value>)",
          textDim: "rgb(var(--bee-text-dim) / <alpha-value>)",
          textMuted: "rgb(var(--bee-text-muted) / <alpha-value>)",
          ok: "rgb(var(--bee-ok) / <alpha-value>)",
          warn: "rgb(var(--bee-warn) / <alpha-value>)",
          err: "rgb(var(--bee-err) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Geist Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      // Dense-IDE type scale. Four steps below Tailwind's `text-sm`, each with
      // its own line-height so rows keep an even rhythm; arbitrary `text-[9px]`
      // sizes set no leading at all, which is what made lists look ragged.
      // 10px is the floor — below that the UI stops being readable.
      fontSize: {
        micro: ['10px', { lineHeight: '14px', letterSpacing: '0.005em' }],
        mini: ['11px', { lineHeight: '15px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['19px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        '2xl': ['23px', { lineHeight: '30px', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      backdropBlur: {
        glass: '14px',
        glassHi: '22px',
      },
      boxShadow: {
        // soft, warm, low-opacity depth
        glass: '0 8px 24px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgb(var(--bee-text) / 0.04)',
        glassHi: '0 18px 48px -16px rgba(0,0,0,0.65), inset 0 1px 0 0 rgb(var(--bee-text) / 0.06)',
        glow: '0 0 0 1px rgb(var(--bee-gold) / 0.18), 0 0 22px -6px rgb(var(--bee-gold) / 0.28)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.14s ease-out',
        'scale-in': 'scale-in 0.14s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
