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
        ink: {
          DEFAULT: "var(--sc-ink)",
          muted: "var(--sc-ink-muted)",
          strong: "var(--sc-ink-strong)",
        },
        surface: {
          DEFAULT: "var(--sc-surface)",
          muted: "var(--sc-surface-muted)",
          plain: "var(--sc-surface-plain)",
          lift: "var(--sc-surface-lift)",
        },
        border: {
          DEFAULT: "var(--sc-border)",
          strong: "var(--sc-border-strong)",
          glow: "var(--sc-border-glow)",
        },
        accent: {
          DEFAULT: "var(--sc-accent)",
          strong: "var(--sc-accent-strong)",
          alt: "var(--sc-accent-alt)",
        },
      },
      borderRadius: {
        "sc-sm": "var(--sc-radius-sm)",
        "sc-md": "var(--sc-radius-md)",
        "sc-lg": "var(--sc-radius-lg)",
        "sc-xl": "var(--sc-radius-xl)",
      },
      boxShadow: {
        card: "var(--sc-shadow-card)",
        strong: "var(--sc-shadow-strong)",
        lift: "var(--sc-shadow-lift)",
      },
      backgroundImage: {
        "page-grid": "var(--sc-page-gradient)",
        "sc-hero": "var(--sc-hero-bg)",
      },
    },
  },
  plugins: [],
}
