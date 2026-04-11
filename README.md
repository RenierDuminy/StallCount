# StallCount

StallCount is a web application for managing league and tournament operations. It provides public event information alongside authenticated tools for scorekeeping, roster management, notifications, playoff configuration, and administrative workflows.

## Technical Summary

The frontend is built as a single-page application using React 18, Vite, and React Router. Data access, authentication, and core operational workflows are backed by Supabase, with shared client and domain logic organised through the service layer in `src/services/`. The application is also configured as a progressive web app using `vite-plugin-pwa`, enabling installation on supported devices, asset caching, and improved resilience for live scoring workflows.

Production builds are generated with `npm run build` and deployed on Vercel, with single-page application rewrites configured in `vercel.json`. The repository also includes a Vercel API route at `api/stb-rl-26-roster-sync.js` that runs the Stellenbosch RL 2026 roster import automatically on a Vercel cron schedule, while push notification delivery is handled separately by the Supabase Edge Function located in `supabase/functions/notification-dispatcher/`.

## Local Run

Install dependencies with `npm install`, configure the required Supabase environment variables in `.env`, and start the development server with `npm run dev`.

For the automated Stellenbosch RL 2026 roster sync in production, also configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- Optional: `STB_RL_26_SIGNUP_CSV_URL`
- Optional: `STB_RL_26_SIGNUP_DOB_MODE`
