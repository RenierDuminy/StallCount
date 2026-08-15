// Tailwind v4 runs through @tailwindcss/vite (see vite.config.js) and handles
// vendor prefixing itself via Lightning CSS, so neither `tailwindcss` nor
// `autoprefixer` belongs here any more. Kept as an empty config so any other
// PostCSS-aware tooling still finds a valid file.
export default {
  plugins: {},
}
