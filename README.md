# StallCount

StallCount is a web application for managing league and tournament operations. It provides public event information alongside authenticated tools for scorekeeping, roster management, notifications, playoff configuration, and administrative workflows.

## Technical Summary

The frontend is built as a single-page application using React 18, Vite, and React Router. Data access, authentication, and core operational workflows are backed by Supabase, with shared client and domain logic organised through the service layer in `src/services/`. The application is also configured as a progressive web app using `vite-plugin-pwa`, enabling installation on supported devices, asset caching, and improved resilience for live scoring workflows.

Production builds are generated with `npm run build` and deployed as a static application on Vercel, with single-page application rewrites configured in `vercel.json`. Push notification delivery is handled separately by the Supabase Edge Function located in `supabase/functions/notification-dispatcher/`.

## Local Run

Install dependencies with `npm install`, configure the required Supabase environment variables in `.env`, and start the development server with `npm run dev`.
