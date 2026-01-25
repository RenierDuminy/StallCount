import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SiteHeader from "./SiteHeader";

const routeFallback = (
  <div className="sc-shell flex min-h-[40vh] items-center justify-center text-sm text-[var(--sc-ink-muted)]">
    Loading...
  </div>
);

export default function AppLayout() {
  const { session } = useAuth();

  return (
    <div className="sc-page flex min-h-screen flex-col">
      <SiteHeader />
      <main className="relative flex-1">
        <Suspense fallback={routeFallback}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-[var(--sc-border)]/60 bg-[#03130d] py-4 text-center text-xs font-semibold uppercase tracking-wide text-emerald-200">
        StallCount is a product of RCFD (Pty) Ltd. For more information contact rcfdltd@gmail.com
      </footer>
    </div>
  );
}
