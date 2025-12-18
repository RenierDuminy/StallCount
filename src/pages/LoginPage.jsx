import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";
import { Card, Chip, Panel, SectionShell, SectionHeader } from "../components/ui/primitives";

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
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#f5fbf6] text-[var(--sc-surface-light-ink)]">
      <SectionShell className="flex min-h-screen items-center justify-center py-12">
        <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <Card variant="light" className="space-y-8 p-8 shadow-xl shadow-[rgba(15,31,25,0.08)]">
            <SectionHeader
              eyebrow="Backend access"
              title="Admin log in"
              description="Secure tools for StallCount crews. Sign in to reach the control surfaces used by your tournament staff."
              eyebrowVariant="tag"
            />
            <div className="grid gap-4 text-sm">
              {ADMIN_MODULES.map((module) => (
                <Panel key={module.label} variant="light" className="p-4 shadow-sm shadow-[rgba(9,31,24,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    {module.label}
                  </p>
                  <p className="mt-1 text-[var(--sc-surface-light-ink)] opacity-80">{module.description}</p>
                </Panel>
              ))}
            </div>
            <Panel variant="light" className="p-4 text-xs text-[var(--sc-surface-light-ink)] opacity-70">
              Need help? Contact ops@stallcount.io to request or adjust access.
            </Panel>
          </Card>

          <Card variant="light" className="space-y-6 p-8 shadow-xl shadow-[rgba(15,31,25,0.08)]">
            <SectionHeader
              eyebrow="Staff workspace"
              title="Sign in to continue"
              description="Use your verified StallCount or Google credentials."
              eyebrowVariant="tag"
            />
            <Panel variant="light" className="p-6 shadow-inner shadow-[rgba(9,31,24,0.04)]">
              <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                theme="default"
                providers={["google"]}
                redirectTo={authRedirectTo}
              />
            </Panel>
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)] opacity-80">
              By signing in you accept StallCount policies.
            </Chip>
          </Card>
        </div>
      </SectionShell>
    </div>
  );
}
