import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import AdminErrorBanner from "./AdminErrorBanner";
import { SilentErrorBoundary } from "./ErrorBoundary";

const routeFallback = (
  <div className="sc-shell flex min-h-[40vh] items-center justify-center text-sm text-[var(--sc-ink-muted)]">
    Loading...
  </div>
);

export default function AppLayout() {
  return (
    <div className="sc-page flex min-h-screen flex-col">
      {/* A component whose job is announcing errors must never cause one. */}
      <SilentErrorBoundary name="AdminErrorBanner">
        <AdminErrorBanner />
      </SilentErrorBoundary>
      <SiteHeader />
      <main className="relative flex-1">
        <Suspense fallback={routeFallback}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-[var(--sc-border)]/60 bg-[var(--sc-bg-accent)] py-4 text-center text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
        StallCount is a product of RCFD (Pty) Ltd. For more information contact{" "}
        <a href="mailto:rcfdltd@gmail.com" className="underline underline-offset-2 hover:text-accent">rcfdltd@gmail.com</a>
      </footer>
    </div>
  );
}
