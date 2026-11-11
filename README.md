# StallCount

StallCount is a web application for managing league and tournament operations. It provides public event information alongside authenticated tools for scorekeeping, roster management, notifications, playoff configuration, and administrative workflows.

## Technical Summary

The frontend is built as a single-page application using React 19, Vite 8, React Router 7 and Tailwind CSS 4. Data access, authentication, and core operational workflows are backed by Supabase, with shared client and domain logic organised through the service layer in `src/services/`. The application is also configured as a progressive web app using `vite-plugin-pwa`, enabling installation on supported devices, asset caching, and improved resilience for live scoring workflows.

Production builds are generated with `npm run build` and deployed on Vercel, with single-page application rewrites configured in `vercel.json`. The repository also includes a Vercel API route at `api/playoff-resolve.js` that fills playoff brackets; Supabase calls it a couple of minutes after a result comes in, and every 6 hours as a backup. Push notification delivery is handled separately by the Supabase Edge Function located in `supabase/functions/notification-dispatcher/`.

Database changes (tables, functions, triggers, policies, cron jobs) are applied by hand in the Supabase SQL editor; the SQL is kept outside this repository. `docs/SQL_structure.txt` is a snapshot of the table structure, which the tournament director's table browser also reads at build time.

### Push notification delivery

1. A `match_logs` insert fires the `enqueue_live_event_from_log` trigger, which queues a `live_events` row with `sent = false`.
2. The database invokes the `notification-dispatcher` Edge Function straight away (pg_net trigger on `live_events`) and again every minute (pg_cron job `notification-dispatcher`), both via `public.invoke_notification_dispatcher()`.
3. The function resolves subscribers, sends Web Push to each `push_subscriptions` endpoint, and only marks the event `sent` after a successful delivery (or when there are no recipients). Failures are recorded in `live_events.attempts` / `last_error` and retried with backoff; dead endpoints (404/410) are pruned; VAPID rejections (401/403) are logged as configuration errors.

Setup: store `stallcount_functions_url`, `stallcount_anon_key`, and `notification_dispatch_secret` in Vault, and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `NOTIFICATION_DISPATCH_SECRET` as secrets on the Edge Function. `VAPID_PUBLIC_KEY` must equal the `VITE_VAPID_PUBLIC_KEY` baked into the Vercel build; the browser client re-subscribes automatically if it detects a key change.

### Automatic playoff resolution

Playoff brackets fill in their own team slots as results come in, instead of waiting for someone to open the Playoff Structure page and press a button.

1. On `/admin/playoff-structure` the TD turns on **Scheduled resolution** for the event (`events.auto_resolve_playoffs`). Optionally, release dates hold chosen games back until a date and time: a date covers any group of games (not necessarily a whole round), and an event has as many as it needs. Rows live in `playoff_resolve_schedules`.
2. When a match finishes, or a finished match's score is corrected, a trigger on `matches` stamps the event in `playoff_resolve_requests`. It is a plain table write, so it can never make End match fail.
3. Every minute, the existing `notification-dispatcher` cron job also runs `public.check_pending_playoffs()`. It calls `api/playoff-resolve` (mode `pending`) only when a note has settled for 2 minutes (time for an offline score to arrive), a note has waited 10 minutes, or a release time has passed. Otherwise it does nothing, so a quiet week costs nothing.
4. The route resolves those events: it seeds from pool standings using the WFDF tie-break ladder, advances winners and losers between nodes, and writes `matches.team_a` / `team_b`, repeating until nothing more changes, so a quarterfinal → semifinal → final chain fills in one run. Notes are cleared only after a successful run.
5. A game that has started or been played keeps its teams. If a later correction means the results now point at different teams, the node shows a blocker naming them rather than changing a live game.
6. Games held by a release date wait until it passes; games no date mentions resolve as soon as their sources allow. Nodes that cannot fill record why on `bracket_nodes.last_resolve_error`, shown as a chip on the admin page.
7. A full sweep of every opted-in event (`pg_cron` job `playoff_resolve_sweeper`, every 6 hours) runs as a backup.

Each run takes a lock with `acquire_automation_job_lock` (`playoff_resolve_pending` for the minute-by-minute path, `playoff_resolve_sweeper` for the sweep) and records its outcome in `automation_job_state`, because `net.http_post` cannot see the response. `brackets.is_locked` is honoured as a hard stop, and the manual **Resolve playoffs** button posts to the same route, so every path shares one implementation.

Setup: store `playoff_resolver_url` (`https://<domain>/api/playoff-resolve`) and `playoff_cron_secret` in Vault. `playoff_cron_secret` must equal the `CRON_SECRET` environment variable on the Vercel deployment. The timer lives in `pg_cron` rather than `vercel.json` because the Vercel Hobby plan only permits daily cron schedules.

## Local Run

Install dependencies with `npm install`, configure the required Supabase environment variables in `.env.local` (see `.env.example`), and start the development server with `npm run dev`.

For automatic playoff resolution in production, also configure on Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (equal to the Supabase Vault secret `playoff_cron_secret`)
