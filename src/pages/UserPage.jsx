import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Chip, Panel, SectionShell, SectionHeader } from "../components/ui/primitives";
import { getCurrentUser } from "../services/userService";
import { supabase } from "../services/supabaseClient";
import { ROLE_NAME_BY_ID, getUserRoleSlugs, normaliseRoleList } from "../utils/accessControl";

const ROLE_LABELS = {
  admin: "Administrator",
  authenticated: "Authenticated user",
};

const ACCESS_LEVELS = {
  admin: "Full access",
  authenticated: "Standard access",
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

const ACCESS_GUIDE = [
  {
    key: "viewer",
    label: "Viewer access",
    description: "General read-only access to live data and schedules.",
  },
  {
    key: "score_capture",
    label: "Field assistant",
    description: "Scorekeeper tools to run live tables and reconcile offline submissions.",
  },
  {
    key: "captain",
    label: "Captain",
    description: "Field assistant capabilities plus team management (rosters and spirit submissions).",
  },
  {
    key: "media",
    label: "Media",
    description: "Ability to modify match media entries and surface highlights for the community site.",
  },
  {
    key: "admin",
    label: "Tournament director",
    description: "Field assistant + captain + media capabilities, along with event management controls.",
  },
];

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
  const { session, roles: sessionRoles } = useAuth();
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

  const assignmentSource = useMemo(() => {
    if (Array.isArray(profile?.roles) && profile.roles.length > 0) {
      return profile.roles;
    }
    if (Array.isArray(sessionRoles) && sessionRoles.length > 0) {
      return sessionRoles;
    }
    return undefined;
  }, [profile?.roles, sessionRoles]);

  const fallbackRoleSource =
    profile?.role ||
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    user?.user_metadata?.roles ||
    "";

  const normalizedRoles = useMemo(() => {
    if (assignmentSource) {
      return getUserRoleSlugs(user, assignmentSource);
    }
    return normaliseRoleList(fallbackRoleSource);
  }, [assignmentSource, fallbackRoleSource, user]);

  const recognisedRoles = useMemo(
    () => normalizedRoles.filter((role) => Boolean(ROLE_LIBRARY[role])),
    [normalizedRoles]
  );

  const fallbackRoles = useMemo(
    () => normalizedRoles.filter((role) => !ROLE_LIBRARY[role]),
    [normalizedRoles]
  );

  const accessLevelLabels = useMemo(() => {
    if (Array.isArray(assignmentSource)) {
      const labels = assignmentSource
        .map((assignment) => assignment?.roleName || assignment?.role?.name || null)
        .filter(Boolean);
      if (labels.length > 0) {
        return Array.from(new Set(labels));
      }
    }
    if (recognisedRoles.length > 0) {
      return recognisedRoles.map((role) => ROLE_LIBRARY[role]?.label || role);
    }
    if (fallbackRoles.length > 0) {
      return fallbackRoles;
    }
    const fallbackAccess = `${accessInfo.role} - ${accessInfo.level}`;
    return fallbackAccess.trim() ? [fallbackAccess] : [];
  }, [assignmentSource, recognisedRoles, fallbackRoles, accessInfo]);

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

  const accessLevelsValue = accessLevelLabels.length > 0 ? accessLevelLabels.join(", ") : `${accessInfo.role} - ${accessInfo.level}`;
  const accessGuideEntries = useMemo(() => {
    const roleSet = new Set(recognisedRoles);
    const entries = ACCESS_GUIDE.filter((entry) => {
      if (entry.key === "viewer") {
        return roleSet.size === 0;
      }
      return roleSet.has(entry.key);
    });
    return entries;
  }, [recognisedRoles]);

  const moduleRoles = useMemo(
    () => recognisedRoles.filter((role) => role !== "admin"),
    [recognisedRoles],
  );
  
  const roleDetails = useMemo(() => {
    if (Array.isArray(assignmentSource) && assignmentSource.length > 0) {
      const map = new Map();
      assignmentSource.forEach((assignment) => {
        const name = assignment?.roleName || assignment?.role?.name || "Role";
        if (map.has(name)) return;
        const slug = normaliseRoleList(name)[0];
        map.set(name, {
          key: assignment?.assignmentId || assignment?.roleId || name,
          name,
          description:
            assignment?.roleDescription ||
            (slug && ROLE_LIBRARY[slug]?.description) ||
            "No description available.",
        });
      });
      return Array.from(map.values());
    }

    if (recognisedRoles.length > 0) {
      return recognisedRoles.map((role) => ({
        key: role,
        name: ROLE_LIBRARY[role]?.label || role,
        description: ROLE_LIBRARY[role]?.description || "No description available.",
      }));
    }

    if (fallbackRoles.length > 0) {
      return fallbackRoles.map((role) => ({
        key: role,
        name: role,
        description: "No description available.",
      }));
    }

    return [];
  }, [assignmentSource, recognisedRoles, fallbackRoles]);

  const profileEntries = useMemo(() => {
    if (!user) return [];
    const metadata = user.user_metadata || {};
    return [
      {
        label: "Full name",
        value: profile?.full_name || metadata.full_name || metadata.name || "Unknown",
      },
      { label: "Email", value: profile?.email || user.email || "Unknown" },
      {
        label: accessLevelLabels.length > 1 ? "Access levels" : "Access level",
        value: accessLevelsValue,
      },
      { label: "Created", value: formatDate(user.created_at) },
    ];
  }, [user, accessLevelLabels.length, accessLevelsValue, profile]);

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
                description="The roles below determine which workflows you can launch within StallCount."
              />
              {roleDetails.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {roleDetails.map((role) => (
                    <Panel key={role.key} variant="muted" className="p-4 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{role.name}</p>
                      <p className="mt-1 text-ink">{role.description}</p>
                    </Panel>
                  ))}
                </div>
              ) : (
                <Chip variant="ghost">General viewer</Chip>
              )}
              {accessGuideEntries.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {accessGuideEntries.map((entry) => (
                    <Panel key={entry.label} variant="muted" className="p-4 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{entry.label}</p>
                      <p className="mt-1 text-ink">{entry.description}</p>
                    </Panel>
                  ))}
                </div>
              )}
            </Card>

            {recognisedRoles.length === 0 ? (
              <Card className="p-6 text-sm text-ink-muted">
                You currently have viewer-level access. Reach out to an administrator if you require elevated permissions for officiating duties.
              </Card>
            ) : moduleRoles.length > 0 ? (
              moduleRoles.map((role) => {
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
            ) : null}

            <Card className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <SectionHeader
                  title="Need help?"
                  description="Reach out if you hit an issue, need access changes, or have general questions."
                />
                <img
                  src="/assets/RCFD Logo (light).png"
                  alt="RCDF logo"
                  className="h-20 w-auto object-contain p-1"
                  loading="lazy"
                />
              </div>
              <div className="grid gap-4 text-sm">
                <Panel variant="muted" className="flex flex-col gap-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">General enquiries</p>
                  <p className="text-ink">
                    StallCount is a product of RCDF (Pty) Ltd. For more information or assistance, drop us an email at{" "}
                    <a
                      href="mailto:rcfdltd@gmail.com"
                      className="inline-flex items-center rounded-full border border-[var(--sc-border)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#c6ff62] transition hover:bg-white/10"
                    >
                      rcfdltd@gmail.com
                    </a>
                  </p>
                </Panel>
              </div>
            </Card>
          </>
        ) : null}
      </SectionShell>
    </div>
  );
}
