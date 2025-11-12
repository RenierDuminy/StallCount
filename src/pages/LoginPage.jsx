import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";

const ADMIN_MODULES = [
  {
    label: "Score keeper",
    description:
      "Capture live scores, sync offline submissions, and monitor the tournament timeline in real time.",
  },
  {
    label: "Captain",
    description:
      "Update rosters, submit spirit feedback, and coordinate with officials for match preparation.",
  },
  {
    label: "Sys admin",
    description:
      "Manage league configuration, crew access, and the datasets that power StallCount operations.",
  },
];

export default function LoginPage() {
  const { session, loading } = useAuth();
  const authRedirectTo =
    import.meta.env.VITE_SUPABASE_REDIRECT_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.href : undefined);

  if (!loading && session) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
        <div className="grid w-full gap-10 rounded-3xl bg-white shadow-xl ring-1 ring-slate-100 md:grid-cols-[1.2fr,1fr] md:gap-12">
          <div className="flex flex-col justify-between rounded-3xl bg-slate-900 px-8 py-10 text-slate-100">
            <div className="space-y-6">
              <span className="inline-flex items-center rounded-full bg-slate-800/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Backend access
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Admin log in
                </h1>
                <p className="text-sm leading-relaxed text-slate-300">
                  Secure tools for StallCount crews. Sign in to reach the control
                  surfaces used by your tournament staff.
                </p>
              </div>
              <dl className="space-y-5 text-sm">
                {ADMIN_MODULES.map((module) => (
                  <div key={module.label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-brand-light">
                      {module.label}
                    </dt>
                    <dd className="mt-1 text-slate-200">{module.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="mt-10 text-xs text-slate-500">
              Need help? Contact ops@stallcount.io to request or adjust access.
            </p>
          </div>
          <div className="flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-sm space-y-5">
              <div className="text-center md:text-left">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Staff workspace
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  Sign in to continue
                </h2>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <Auth
                  supabaseClient={supabase}
                  appearance={{ theme: ThemeSupa }}
                  theme="default"
                  providers={["google"]}
                  redirectTo={authRedirectTo}
                />
              </div>
              <p className="text-xs text-slate-500">
                By signing in you acknowledge StallCount's officiating handbook and data
                handling policies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
