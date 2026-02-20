/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: 'rgba(10, 10, 10, 0.45)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.06)',
          active: 'rgba(255, 255, 255, 0.1)',
        },
      },
      backgroundColor: {
        'glass-dark': 'rgba(0, 0, 0, 0.2)',
        'glass-darker': 'rgba(0, 0, 0, 0.4)',
        'glass-light': 'rgba(255, 255, 255, 0.03)',
        'glass-lighter': 'rgba(255, 255, 255, 0.05)',
      },
      backdropBlur: {
        'glass': '40px',
      },
      borderRadius: {
        'panel': '12px',
        'elem': '8px',
      },
      boxShadow: {
        'glass': '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'glass-sm': '0 2px 10px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
};
