import type { Config } from 'tailwindcss';

/**
 * Design tokens extracted 1:1 from reference/devradar-site.html :root.
 * The ported sections keep the prototype's class names (globals.css);
 * these tokens exist so any NEW utility usage stays on-system.
 * Do not invent new colors or fonts (handoff Section 9).
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        black: { DEFAULT: '#060607', 2: '#0A0A0C' },
        gold: {
          DEFAULT: '#E2B65B',
          hi: '#F4D789',
          deep: '#B9893A',
        },
        white: { DEFAULT: '#F4F2EC' },
        grey: { DEFAULT: '#9C9A93', 2: '#5F5D58' },
        win: '#5CDD94',
        rug: '#F2555C',
      },
      fontFamily: {
        display: ['Clash Display', 'sans-serif'],
        body: ['Switzer', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      borderRadius: {
        r: '20px',
      },
      maxWidth: {
        max: '1200px',
      },
      transitionTimingFunction: {
        ease: 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  corePlugins: {
    preflight: false, // the prototype ships its own reset — keep the cascade identical
  },
  plugins: [],
};

export default config;
