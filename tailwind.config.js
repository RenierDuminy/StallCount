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
        warning: {
          DEFAULT: "var(--sc-warning)",
          ink: "var(--sc-warning-ink)",
          bg: "var(--sc-warning-bg)",
          border: "var(--sc-warning-border)",
        },
        media: {
          DEFAULT: "var(--sc-media)",
          ink: "var(--sc-media-ink)",
          bg: "var(--sc-media-bg)",
          border: "var(--sc-media-border)",
        },
        admin: {
          DEFAULT: "var(--sc-admin)",
          ink: "var(--sc-admin-ink)",
          bg: "var(--sc-admin-bg)",
          border: "var(--sc-admin-border)",
        },
        live: {
          DEFAULT: "var(--sc-live)",
          ink: "var(--sc-live-ink)",
          bg: "var(--sc-live-bg)",
          border: "var(--sc-live-border)",
        },
      },
      borderRadius: {
        "sc-sm": "var(--sc-radius-sm)",
        "sc-md": "var(--sc-radius-md)",
        "sc-lg": "var(--sc-radius-lg)",
        "sc-xl": "var(--sc-radius-xl)",
        // Reduced global rounding scale (overrides Tailwind defaults).
        // Pill/circle (`rounded-full`) is intentionally left untouched.
        sm: "3px",
        DEFAULT: "4px",
        md: "5px",
        lg: "6px",
        xl: "8px",
        "2xl": "10px",
        "3xl": "12px",
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
