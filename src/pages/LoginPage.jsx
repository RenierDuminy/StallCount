import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SupabaseAuthForm from "../components/SupabaseAuthForm";
import { Card, Chip, SectionShell, SectionHeader } from "../components/ui/primitives";

export default function LoginPage() {
  const { session, loading } = useAuth();
  const envRedirectTo = import.meta.env.VITE_SUPABASE_REDIRECT_URL?.trim();
  const authRedirectTo = (() => {
    if (typeof window === "undefined") return envRedirectTo;
    const { origin, hostname } = window.location;
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local");
    if (isLocalhost) return `${origin}/`;
    return envRedirectTo || `${origin}/`;
  })();

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#f5fbf6] text-[var(--sc-surface-light-ink)]">
      <SectionShell className="flex min-h-screen items-center justify-center py-12">
        <div className="w-full max-w-xl">
          <Card variant="light" className="space-y-6 p-8 shadow-xl shadow-[rgba(15,31,25,0.08)]">
            <SectionHeader
              title="Sign in to continue"
              description="Use your verified StallCount or Google credentials."
              eyebrowVariant="tag"
            />
            <SupabaseAuthForm redirectTo={authRedirectTo} />
            <Chip variant="ghost" className="text-xs text-[var(--sc-surface-light-ink)] opacity-80">
              By signing in you accept StallCount policies.
            </Chip>
          </Card>
        </div>
      </SectionShell>
    </div>
  );
}
