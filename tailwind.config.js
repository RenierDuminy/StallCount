import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: {
          DEFAULT: "#0E9E6E",
          light: "#33BA8A",
          dark: "#047857",
        },
      },
      boxShadow: {
        card: "0 20px 45px -24px rgba(15, 118, 110, 0.35)",
      },
    },
  },
  plugins: [],
}
