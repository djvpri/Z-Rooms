/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#E1F5EE', 100: '#9FE1CB', 400: '#1D9E75',
          600: '#0F6E56', 800: '#085041', 900: '#04342C',
        },
        coral: {
          50: '#FAECE7', 400: '#D85A30', 600: '#993C1D', 900: '#4A1B0C',
        },
        amber: {
          50: '#FAEEDA', 400: '#BA7517', 900: '#412402',
        },
        purple: {
          50: '#EEEDFE', 400: '#7F77DD', 600: '#534AB7', 900: '#26215C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
