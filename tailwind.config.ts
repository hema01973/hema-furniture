import type { Config } from 'tailwindcss';
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        serif:  ['Cormorant Garamond', 'Georgia', 'serif'],
        sans:   ['DM Sans', 'system-ui', 'sans-serif'],
        arabic: ['Tajawal', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#FAF8F5', espresso: '#1A1208',
        gold: { DEFAULT: '#B8935A', light: '#D4B07A', dark: '#8B6B3A' },
        sage: '#6B7F6A',
        sand: { DEFAULT: '#E8DDD0', light: '#F2EDE6', dark: '#D0C4B4' },
      },
    },
  },
  plugins: [],
};
export default config;
