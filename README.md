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

### Scheduled playoff resolution

Playoff brackets can fill in their own team slots at times set by the tournament director, instead of waiting for someone to open the Playoff Structure page and press a button.

1. On `/admin/playoff-structure`, the TD adds release dates and ticks which games each one covers, then turns on **Scheduled resolution** for the event. A date covers an arbitrary group of games — it does not have to be a whole round — and an event has as many dates as it needs (2–5 is typical; nothing assumes a count). Rows live in `playoff_resolve_schedules`.
2. A `pg_cron` job runs `public.invoke_playoff_resolver()` every 6 hours, which `net.http_post`s to the `api/playoff-resolve` route with the shared secret.
3. The route resolves every opted-in, open event: it seeds from pool standings using the WFDF tie-break ladder, advances winners and losers between nodes, and writes `matches.team_a` / `team_b`. It repeats until nothing more changes, so a quarterfinal → semifinal → final chain fills in one run.
4. Games covered by a date that has not yet passed are held back. Games no date mentions resolve as soon as their sources allow, so adding schedules only ever delays things — it never gates something nobody scheduled. A game listed by two dates takes the earlier one.
5. Nodes it cannot fill record why on `bracket_nodes.last_resolve_error` (an unfinished pool, a tie, no linked match), which the admin page shows as a chip. Later sweeps retry automatically.

The run is guarded by `acquire_automation_job_lock` against the `playoff_resolve_sweeper` row in `automation_job_state`, so overlapping sweeps are safe; that row is also where each run's outcome is recorded, since `net.http_post` is fire-and-forget and cannot observe the response. `brackets.is_locked` is honoured as a hard stop, and the manual **Resolve playoffs** button posts to the same route so both paths share one implementation.

Setup: apply `supabase/migrations/20260915000000_playoff_auto_resolve.sql`, then store `playoff_resolver_url` (`https://<domain>/api/playoff-resolve`) and `playoff_cron_secret` in Vault. `playoff_cron_secret` must equal the `CRON_SECRET` environment variable on the Vercel deployment. The timer lives in `pg_cron` rather than `vercel.json` because the Vercel Hobby plan only permits daily cron schedules.

Because the sweep runs on a 6-hour cadence (00:00, 06:00, 12:00, 18:00 UTC), a release date takes effect at the first sweep at or after it — set dates with that in mind, or press **Resolve playoffs** to release everything immediately.

## Local Run

Install dependencies with `npm install`, configure the required Supabase environment variables in `.env`, and start the development server with `npm run dev`.

For the automated Stellenbosch RL 2026 roster sync in production, also configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- Optional: `STB_RL_26_SIGNUP_CSV_URL`
- Optional: `STB_RL_26_SIGNUP_DOB_MODE`
