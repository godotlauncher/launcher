/** @type {import('tailwindcss').Config} */

// *************
// * Note on Menu Icon Colors
// * The light and dark colours are set in the png files.
// * the filenames _dark and _light represent the current theme not the icon Colour.
// * The icon colours directly set in fonts.google.com/icons and downloaded as pngs.
// * The icons size is 24px
// * Light Colour: #1F2937
// * Dark Colour: #A6ADBB
// *************

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

