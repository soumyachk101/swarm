import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Sibling workspace packages ship React UI with Tailwind classes; scan them
    // too or their utilities (text sizes, spacing) get purged and render huge.
    '../Tasks/src/**/*.{ts,tsx}',
    '../Agents/src/ui/**/*.{ts,tsx}',
    '../Workspace/src/ui/**/*.{ts,tsx}',
    '../Lead/src/ui/**/*.{ts,tsx}',
    '../Voice/src/ui/**/*.{ts,tsx}',
    '../Pheromone/src/ui/**/*.{ts,tsx}',
    '../Board/src/**/*.{ts,tsx}',
    '../SwarmPlugins/src/**/*.{ts,tsx}',
    '../SwarmExtension/src/**/*.{ts,tsx}',
    '../Tasks/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        swarm: {
          // All tokens are RGB channel CSS vars — ThemePicker swaps them live.
          canvas: "rgb(var(--swarm-canvas) / <alpha-value>)",
          canvasHi: "rgb(var(--swarm-canvas-hi) / <alpha-value>)",
          surface: "rgb(var(--swarm-surface) / <alpha-value>)",
          surfaceHi: "rgb(var(--swarm-surface-hi) / <alpha-value>)",
          border: "rgb(var(--swarm-border) / <alpha-value>)",
          borderHi: "rgb(var(--swarm-border-hi) / <alpha-value>)",
          gold: "rgb(var(--swarm-gold) / <alpha-value>)",
          goldHi: "rgb(var(--swarm-gold-hi) / <alpha-value>)",
          goldDim: "rgb(var(--swarm-gold-dim) / <alpha-value>)",
          honey: "rgb(var(--swarm-honey) / <alpha-value>)",
          amber: "rgb(var(--swarm-amber) / <alpha-value>)",
          text: "rgb(var(--swarm-text) / <alpha-value>)",
          textDim: "rgb(var(--swarm-text-dim) / <alpha-value>)",
          textMuted: "rgb(var(--swarm-text-muted) / <alpha-value>)",
          ok: "rgb(var(--swarm-ok) / <alpha-value>)",
          warn: "rgb(var(--swarm-warn) / <alpha-value>)",
          err: "rgb(var(--swarm-err) / <alpha-value>)",
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
        glass: '0 8px 24px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgb(var(--swarm-text) / 0.04)',
        glassHi: '0 18px 48px -16px rgba(0,0,0,0.65), inset 0 1px 0 0 rgb(var(--swarm-text) / 0.06)',
        glow: '0 0 0 1px rgb(var(--swarm-gold) / 0.18), 0 0 22px -6px rgb(var(--swarm-gold) / 0.28)',
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
