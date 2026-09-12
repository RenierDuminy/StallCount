# StallCount

StallCount is a web application for managing league and tournament operations. It provides public event information alongside authenticated tools for scorekeeping, roster management, notifications, playoff configuration, and administrative workflows.

## Technical Summary

The frontend is built as a single-page application using React 18, Vite, and React Router. Data access, authentication, and core operational workflows are backed by Supabase, with shared client and domain logic organised through the service layer in `src/services/`. The application is also configured as a progressive web app using `vite-plugin-pwa`, enabling installation on supported devices, asset caching, and improved resilience for live scoring workflows.

Production builds are generated with `npm run build` and deployed on Vercel, with single-page application rewrites configured in `vercel.json`. The repository also includes a Vercel API route at `api/stb-rl-26-roster-sync.js` that runs the Stellenbosch RL 2026 roster import automatically once per day at 17:00 SAST (15:00 UTC) on a Vercel cron schedule, while push notification delivery is handled separately by the Supabase Edge Function located in `supabase/functions/notification-dispatcher/`.

### Push notification delivery

1. A `match_logs` insert fires the `enqueue_live_event_from_log` trigger, which queues a `live_events` row with `sent = false`.
2. The database invokes the `notification-dispatcher` Edge Function straight away (pg_net trigger on `live_events`) and again every minute (pg_cron sweeper), both via `public.invoke_notification_dispatcher()`.
3. The function resolves subscribers, sends Web Push to each `push_subscriptions` endpoint, and only marks the event `sent` after a successful delivery (or when there are no recipients). Failures are recorded in `live_events.attempts` / `last_error` and retried with backoff; dead endpoints (404/410) are pruned; VAPID rejections (401/403) are logged as configuration errors.

Setup: apply `supabase/migrations/20260912120000_notification_dispatch.sql`, store `stallcount_functions_url`, `stallcount_anon_key`, and `notification_dispatch_secret` in Vault, and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `NOTIFICATION_DISPATCH_SECRET` as secrets on the Edge Function. `VAPID_PUBLIC_KEY` must equal the `VITE_VAPID_PUBLIC_KEY` baked into the Vercel build; the browser client re-subscribes automatically if it detects a key change.

## Local Run

Install dependencies with `npm install`, configure the required Supabase environment variables in `.env`, and start the development server with `npm run dev`.

For the automated Stellenbosch RL 2026 roster sync in production, also configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- Optional: `STB_RL_26_SIGNUP_CSV_URL`
- Optional: `STB_RL_26_SIGNUP_DOB_MODE`
