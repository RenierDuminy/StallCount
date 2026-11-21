import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  {
    // Build tooling runs in Node, not the browser.
    files: ['vite.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      // react-hooks v7 nests the flat-config variants under `flat`;
      // the top-level `recommended-latest` is the legacy eslintrc shape.
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Injected at build time by Vite's `define` (see vite.config.js).
        __BUILD_SHA__: 'readonly',
        __BUILD_TIME__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // react-hooks v7 added these three rules, which flag ~117 pre-existing
      // patterns across ~30 files. Reviewed and downgraded to warnings rather
      // than rewritten -- none is a live defect, and the churn would be large
      // and untestable. Fix opportunistically when already editing a file.
      //
      // set-state-in-effect (91): async fetch effects that synchronously reset
      //   state before awaiting ("clear stale data, show spinner"). The awaited
      //   updates are already guarded by isSubscribed/isActive cancel flags.
      // refs (18): all in EventSetupWizard.jsx, all the documented lazy-ref
      //   init idiom (`if (ref.current === null) ref.current = ...`) feeding
      //   useState initialisers.
      // purity (3): Date.now() read inside useMemo on HomePage/EventsPage. A
      //   real smell -- worst case a "next match" label goes stale until the
      //   memo's dependencies change -- but not a correctness bug today.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // Colours live in src/theme.css. In a component use a token class
    // (bg-light-page, text-accent-ink, bg-team-a ...) or var(--sc-*) in an SVG
    // attribute, so a change is made once. Matches #rgb, #rgba, #rrggbb and
    // #rrggbbaa inside a string, so a URL fragment like "#community" passes.
    files: ['src/**/*.jsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/(^|[^\\w&])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\\w])/]',
          message:
            'Hard-coded hex colour. Use a token class or var(--sc-*) from src/theme.css (add a token there if none fits).',
        },
        {
          selector:
            'TemplateElement[value.raw=/(^|[^\\w&])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\\w])/]',
          message:
            'Hard-coded hex colour. Use a token class or var(--sc-*) from src/theme.css (add a token there if none fits).',
        },
      ],
    },
  },
  {
    // Deliberate literals: the two field consoles (their own --sk-* token set is
    // a later task), the Google logo, overlay default colours and the media
    // colour box (user-entered colours).
    files: [
      'src/pages/scorekeeper/**',
      'src/pages/scrimmage/**',
      'src/components/SupabaseAuthForm.jsx',
      'src/overlay/OverlayTestMatchPanel.jsx',
      'src/pages/OverlayControlPage.jsx',
      'src/pages/MediaAdminPage.jsx',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
