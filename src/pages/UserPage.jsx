import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Chip, Panel, SectionShell, SectionHeader } from "../components/ui/primitives";
import { getCurrentUser } from "../services/userService";
import { supabase } from "../services/supabaseClient";

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

const ROLE_LIBRARY = {
  admin: {
    label: "Administration",
    description:
      "Configure tournaments, control user access, and manage the master data that powers StallCount.",
    actions: [
      "Approve and manage official crew accounts.",
      "Edit league settings, divisions, and event timelines.",
      "Review audit logs for score adjustments.",
    ],
  },
  media: {
    label: "Media & Communications",
    description:
      "Publish match reports, highlight reels, and updates for the community site.",
    actions: [
      "Queue social posts and match summaries.",
      "Upload photography or video assets.",
      "Coordinate post-match interviews and press briefs.",
    ],
  },
  score_capture: {
    label: "Score Capture",
    description:
      "Operate live tables, sync offline scorepads, and keep crews aligned during play.",
    actions: [
      "Run the live scoreboard monitor.",
      "Reconcile offline submissions from field devices.",
      "Flag dispute reports for head officials.",
    ],
  },
  captain: {
    label: "Team Captains",
    description:
      "Monitor your roster, submit spirit feedback, and review scouting intel.",
    actions: [
      "Submit pre-game rosters and matchup notes.",
      "Complete spirit scoring within the 12-hour window.",
      "Share quick highlights with team channels.",
    ],
  },
};

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function normaliseRoles(roleField) {
  if (!roleField) return [];
  const values = Array.isArray(roleField) ? roleField : String(roleField).split(",");
  return values
    .map((role) => role.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
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
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(user));
  const [profileError, setProfileError] = useState(null);
  const accessInfo = useMemo(() => resolveAccessLevel(user), [user]);

  useEffect(() => {
    let isCancelled = false;
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const data = await getCurrentUser();
        if (!isCancelled) {
          setProfile(data);
        }
      } catch (error) {
        console.error("[UserPage] Unable to load dashboard profile", error);
        if (!isCancelled) {
          setProfileError(error instanceof Error ? error.message : "Unable to load profile.");
        }
      } finally {
        if (!isCancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      isCancelled = true;
    };
  }, [user]);

  const roleSource =
    profile?.role ||
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    user?.user_metadata?.roles ||
    "";

  const normalizedRoles = useMemo(() => normaliseRoles(roleSource), [roleSource]);

  const recognisedRoles = useMemo(
    () => normalizedRoles.filter((role) => Boolean(ROLE_LIBRARY[role])),
    [normalizedRoles]
  );

  const fallbackRoles = useMemo(
    () => normalizedRoles.filter((role) => !ROLE_LIBRARY[role]),
    [normalizedRoles]
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    profile?.email ||
    user?.email ||
    "User profile";

  const profileEntries = useMemo(() => {
    if (!user) return [];
    const metadata = user.user_metadata || {};
    return [
      {
        label: "Full name",
        value: profile?.full_name || metadata.full_name || metadata.name || "Unknown",
      },
      { label: "Email", value: profile?.email || user.email || "Unknown" },
      { label: "Access level", value: `${accessInfo.role} - ${accessInfo.level}` },
      { label: "User ID", value: user.id || "-" },
      { label: "Created", value: formatDate(user.created_at) },
      { label: "Last sign-in", value: formatDate(user.last_sign_in_at) },
    ];
  }, [user, accessInfo, profile]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell className="space-y-6">
        <Card className="space-y-5 p-6 sm:p-7">
          <SectionHeader
            eyebrow="Account overview"
            title={displayName}
            description="Quick access to the information we have on record for your StallCount login."
            action={
              user ? (
                <button className="sc-button is-ghost" type="button" onClick={handleLogout}>
                  Sign out
                </button>
              ) : null
            }
          />
          {profileLoading && (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Loading your dashboard profile...
            </Panel>
          )}
          {profileError && (
            <Panel variant="muted" className="p-4 text-sm text-ink">
              {profileError}
            </Panel>
          )}
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

        {user ? (
          <>
            <Card className="space-y-5 p-6">
              <SectionHeader
                eyebrow="Your access"
                title="Permissions overview"
                description="The roles below determine which workflows you can launch within StallCount."
              />
              <div className="flex flex-wrap gap-2">
                {recognisedRoles.length > 0 ? (
                  recognisedRoles.map((role) => (
                    <Chip key={role} variant="tag">
                      {ROLE_LIBRARY[role].label}
                    </Chip>
                  ))
                ) : (
                  <Chip variant="ghost">General viewer</Chip>
                )}
              </div>
              {fallbackRoles.length > 0 && (
                <Panel variant="muted" className="p-4 text-xs text-ink-muted">
                  Unknown roles detected: {fallbackRoles.join(", ")}. Please contact an administrator to review your access.
                </Panel>
              )}
            </Card>

            {recognisedRoles.length > 0 ? (
              recognisedRoles.map((role) => {
                const module = ROLE_LIBRARY[role];
                return (
                  <Card key={role} className="space-y-4 p-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-ink">{module.label}</h3>
                        <p className="text-sm text-ink-muted">{module.description}</p>
                      </div>
                      <Chip variant="ghost" className="uppercase tracking-wide">
                        {role.replace(/_/g, " ")}
                      </Chip>
                    </div>
                    <div className="space-y-3">
                      {module.actions.map((action) => (
                        <Panel key={action} variant="muted" className="p-4 text-sm text-ink">
                          {action}
                        </Panel>
                      ))}
                    </div>
                  </Card>
                );
              })
            ) : (
              <Card className="p-6 text-sm text-ink-muted">
                You currently have viewer-level access. Reach out to an administrator if you require elevated permissions for officiating duties.
              </Card>
            )}

            <Card className="space-y-4 p-6">
              <SectionHeader title="Need quick help?" description="Reach out to the crew below if you get stuck mid-event." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Panel variant="muted" className="p-4 text-sm text-ink">
                  <p className="font-semibold text-ink">Operations Desk</p>
                  <p className="mt-1 text-xs text-ink-muted">ops@stallcount.io / +1 (555) 010 2234</p>
                </Panel>
                <Panel variant="muted" className="p-4 text-sm text-ink">
                  <p className="font-semibold text-ink">Documentation</p>
                  <p className="mt-1 text-xs text-ink-muted">Review the deployment handbook for process details.</p>
                </Panel>
              </div>
            </Card>
          </>
        ) : null}
      </SectionShell>
    </div>
  );
}
