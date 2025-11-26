import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";

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
  if (!value) return "—";
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
  const accessLevel =
    ACCESS_LEVELS[metaRole] ||
    ACCESS_LEVELS[user.app_metadata?.role] ||
    "Standard access";

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
      { label: "Access level", value: `${accessInfo.role} · ${accessInfo.level}` },
      { label: "User ID", value: user.id || "-" },
      {
        label: "Created",
        value: user.created_at ? formatDate(user.created_at) : "Unknown",
      },
      {
        label: "Last sign-in",
        value: user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Unknown",
      },
    ];
  }, [user, accessInfo]);

  return (
    <div className="pb-16 text-[var(--sc-ink)]">
      <div className="sc-shell space-y-6">
        <header className="sc-card-base p-6 sm:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="sc-chip">Account overview</p>
              <h1 className="text-3xl font-semibold text-[var(--sc-ink)]">
                {user?.user_metadata?.full_name || "User profile"}
              </h1>
              <p className="mt-2 text-sm text-[var(--sc-ink-muted)]">
                Quick access to the information we have on record for your StallCount login.
              </p>
            </div>
          </div>
        </header>

        <section className="sc-card-base space-y-4 p-6">
          {!user ? (
            <p className="text-sm text-[var(--sc-ink-muted)]">
              You are not signed in. Log in to view your profile information.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {profileEntries.map((entry) => (
                <article key={entry.label} className="sc-card-muted p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    {entry.label}
                  </p>
                  <p className="mt-1 text-base font-semibold text-[var(--sc-ink)]">{entry.value}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
