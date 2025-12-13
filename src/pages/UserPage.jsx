import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Panel, SectionShell, SectionHeader } from "../components/ui/primitives";

const ROLE_LABELS = {
  admin: "Administrator",
  authenticated: "Authenticated user",
};

const ACCESS_LEVELS = {
  admin: "Full access",
  authenticated: "Standard access",
};

const ROLE_NAME_BY_ID = {
  1: "Administrator",
  2: "Score keeper",
  3: "Captain",
  4: "Standard user",
};

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function resolveAccessLevel(user) {
  if (!user) return { role: "Unknown", level: "Unknown" };

  const metaRole = user.role || "authenticated";
  const profileRole =
    user.app_metadata?.role ||
    ROLE_NAME_BY_ID[user.user_metadata?.role_id] ||
    ROLE_LABELS[metaRole] ||
    "Authenticated user";
  const accessLevel = ACCESS_LEVELS[metaRole] || ACCESS_LEVELS[user.app_metadata?.role] || "Standard access";

  return { role: profileRole, level: accessLevel };
}

export default function UserPage() {
  const { session } = useAuth();
  const user = session?.user || null;
  const accessInfo = useMemo(() => resolveAccessLevel(user), [user]);

  const profileEntries = useMemo(() => {
    if (!user) return [];
    const metadata = user.user_metadata || {};
    return [
      { label: "Full name", value: metadata.full_name || metadata.name || "Unknown" },
      { label: "Email", value: user.email || "Unknown" },
      { label: "Access level", value: `${accessInfo.role} - ${accessInfo.level}` },
      { label: "User ID", value: user.id || "-" },
      { label: "Created", value: formatDate(user.created_at) },
      { label: "Last sign-in", value: formatDate(user.last_sign_in_at) },
    ];
  }, [user, accessInfo]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell className="space-y-6">
        <Card className="p-6 sm:p-7">
          <SectionHeader
            eyebrow="Account overview"
            title={user?.user_metadata?.full_name || "User profile"}
            description="Quick access to the information we have on record for your StallCount login."
          />
        </Card>

        <Card className="space-y-4 p-6">
          {!user ? (
            <p className="text-sm text-ink-muted">You are not signed in. Log in to view your profile information.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {profileEntries.map((entry) => (
                <Panel key={entry.label} variant="muted" className="p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{entry.label}</p>
                  <p className="mt-1 break-words text-base font-semibold text-ink">{entry.value}</p>
                </Panel>
              ))}
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
