/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('daisyui')
  ],

  daisyui: {
    themes: [{
      light:
      {
        ...require('daisyui/src/theming/themes')['light'],
        primary: '#3C77C2',
        secondary: '#EB9486',
        background: '#F9FAFB',
      },
      dark:
      {
        ...require('daisyui/src/theming/themes')['dark'],
        primary: '#3C77C2',
        secondary: '#EB9486',
        background: '#1D232A',
      }
    }],

  },
};

