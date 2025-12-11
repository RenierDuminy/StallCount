import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SiteHeader from "./SiteHeader";

export default function AppLayout() {
  const { session } = useAuth();

  return (
    <div className="sc-page flex min-h-screen flex-col">
      <div className="sc-page__glow" aria-hidden="true" />
      <SiteHeader />
      <main className="relative flex-1">
        {!session && (
          <div className="bg-amber-50/90 text-amber-900">
            <div className="sc-shell flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <p className="font-semibold">Data hidden: sign in to view live match details.</p>
              <Link
                to="/login"
                className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-600"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
