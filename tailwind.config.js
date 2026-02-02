/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        eneo: '#ed1c24', // Le rouge Eneo pour le style
      }
    },
  },
  plugins: [],
}