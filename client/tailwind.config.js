/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        green: {
          golf: '#2d6a4f',
          light: '#52b788',
        }
      }
    }
  },
  plugins: [],
}
