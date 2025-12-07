# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Supabase authentication

Create an `.env` file with the Supabase keys plus the origin that Supabase should redirect back to after Google or magic link flows:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_REDIRECT_URL=http://localhost:3000/login
```

Whatever value you supply for `VITE_SUPABASE_REDIRECT_URL` **must** also be included in **Authentication → URL Configuration → Redirect URLs** inside the Supabase dashboard. During local development you can switch the origin (for example to `http://localhost:5173/login`) without touching the code—just update the env variable and restart Vite.

## Notification Edge Function

Push fan-out logic for Supabase runs inside `supabase/functions/notification-dispatcher/index.ts`.

Deploy and schedule it like so:

```bash
# deploy
supabase functions deploy notification-dispatcher --no-verify-jwt

# required secrets
supabase secrets set \
  SUPABASE_URL="https://<project>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="service-role-key" \
  VAPID_PUBLIC_KEY="BL4H..." \
  VAPID_PRIVATE_KEY="oq_K..."

# run every 30 seconds
supabase schedule create notification-dispatcher \
  --function notification-dispatcher \
  --cron "*/30 * * * * *"
```

The function queries pending rows in `live_events`, maps matching `subscriptions`, fetches each follower's `push_subscriptions`, and sends notifications via Web Push before marking each event as `sent`.
