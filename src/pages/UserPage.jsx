import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Card, Chip, Panel, SectionShell, SectionHeader } from "../components/ui/primitives";
import { getCurrentUser } from "../services/userService";
import { supabase } from "../services/supabaseClient";
import { getUserRoleSlugs, normaliseRoleList } from "../utils/accessControl";

const ROLE_LABELS = {
  admin: "Administrator",
  user: "User",
  authenticated: "Authenticated user",
};

const ACCESS_LEVELS = {
  admin: "Full access",
  user: "Viewer access",
  authenticated: "Standard access",
};

const NON_ELEVATED_ROLE_SLUGS = new Set(["user"]);

const ROLE_LIBRARY = {
  user: {
    label: "User",
    description:
      "Base account access for reading schedules, scores, and public event information.",
    actions: [],
  },
  admin: {
    label: "Administrator",
    description:
      "Configure tournaments, control user access, and manage the master data that powers StallCount.",
    actions: [
      "Approve and manage official crew accounts.",
      "Edit league settings, divisions, and event timelines.",
      "Review audit logs for score adjustments.",
    ],
  },
  tournament_director: {
    label: "Tournament director",
    description:
      "Oversee event operations, setup workflows, and administrative controls across assigned events.",
    actions: [
      "Configure event structure, divisions, pools, and fixtures.",
      "Manage operational pages for tournament workflows.",
      "Coordinate officiating and event-level access.",
    ],
  },
  scorekeeper: {
    label: "Scorekeeper",
    description:
      "Operate live scoring workflows and keep match state synchronized during games.",
    actions: [
      "Run live scorekeeping during matches.",
      "Capture game events with consistent timelines.",
      "Sync tracked outcomes into shared match records.",
    ],
  },
  field_assistant: {
    label: "Field assistant",
    description:
      "Support on-field operations and score capture workflows.",
    actions: [
      "Assist scorekeeping crews with live operations.",
      "Help maintain accurate field-side game records.",
      "Support tournament control room procedures.",
    ],
  },
  team_manager: {
    label: "Team manager",
    description:
      "Manage team-level operations and roster-related workflows.",
    actions: [
      "Coordinate roster readiness for events.",
      "Support team administrative submissions.",
      "Assist captains with event operations.",
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
    key: "field_assistant",
    label: "Field assistant",
    description: "Scorekeeper tools to run live tables and reconcile offline submissions.",
  },
  {
    key: "scorekeeper",
    label: "Scorekeeper",
    description: "Full scorekeeper workflow access for live match operations.",
  },
  {
    key: "captain",
    label: "Captain",
    description: "Field assistant capabilities plus team management (rosters and spirit submissions).",
  },
  {
    key: "team_manager",
    label: "Team manager",
    description: "Team operations support, including event administration and coordination.",
  },
  {
    key: "media",
    label: "Media",
    description: "Ability to modify match media entries and surface highlights for the community site.",
  },
  {
    key: "tournament_director",
    label: "Tournament director",
    description: "Administrative control for event setup, scheduling, and staff workflows.",
  },
  {
    key: "admin",
    label: "Administrator",
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

  const userMeta = user.user_metadata || {};
  const appMeta = user.app_metadata || {};
  const metaRole = userMeta.role || appMeta.role || "authenticated";
  const profileRole =
    appMeta.role ||
    ROLE_LABELS[metaRole] ||
    "Authenticated user";
  const accessLevel = ACCESS_LEVELS[metaRole] || ACCESS_LEVELS[appMeta.role] || "Standard access";

  return { role: profileRole, level: accessLevel };
}

function isElevatedRole(role) {
  return Boolean(role) && !NON_ELEVATED_ROLE_SLUGS.has(role);
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

  const globalAssignmentSource = useMemo(() => {
    if (Array.isArray(profile?.roles) && profile.roles.length > 0) {
      return profile.roles;
    }
    if (Array.isArray(sessionRoles) && sessionRoles.length > 0) {
      const globalAssignments = sessionRoles.filter(
        (assignment) => (assignment?.scope || "global") === "global",
      );
      if (globalAssignments.length > 0) {
        return globalAssignments;
      }
    }
    return undefined;
  }, [profile?.roles, sessionRoles]);

  const eventAssignmentSource = useMemo(() => {
    if (Array.isArray(profile?.eventRoles) && profile.eventRoles.length > 0) {
      return profile.eventRoles;
    }
    if (Array.isArray(sessionRoles) && sessionRoles.length > 0) {
      return sessionRoles.filter((assignment) => assignment?.scope === "event");
    }
    return [];
  }, [profile?.eventRoles, sessionRoles]);

  const fallbackRoleSource =
    profile?.role ||
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    user?.user_metadata?.roles ||
    "user";

  const normalizedRoles = useMemo(() => {
    const collected = new Set();

    if (globalAssignmentSource) {
      getUserRoleSlugs(user, globalAssignmentSource).forEach((role) =>
        collected.add(role),
      );
    } else {
      normaliseRoleList(fallbackRoleSource).forEach((role) => collected.add(role));
    }

    eventAssignmentSource.forEach((assignment) => {
      const roleValue =
        assignment?.roleName || assignment?.role?.name || assignment?.roleId || "";
      normaliseRoleList(roleValue).forEach((role) => collected.add(role));
    });

    return Array.from(collected);
  }, [globalAssignmentSource, fallbackRoleSource, eventAssignmentSource, user]);

  const recognisedRoles = useMemo(
    () => normalizedRoles.filter((role) => Boolean(ROLE_LIBRARY[role])),
    [normalizedRoles]
  );

  const elevatedRoles = useMemo(
    () => normalizedRoles.filter((role) => isElevatedRole(role)),
    [normalizedRoles],
  );

  const fallbackRoles = useMemo(
    () => normalizedRoles.filter((role) => !ROLE_LIBRARY[role]),
    [normalizedRoles]
  );

  const accessLevelLabels = useMemo(() => {
    const labels = [];

    if (Array.isArray(globalAssignmentSource)) {
      const globalLabels = globalAssignmentSource
        .map((assignment) => assignment?.roleName || assignment?.role?.name || null)
        .filter(Boolean)
        .map((name) => `${name} (Global)`)
        .filter(Boolean);
      labels.push(...globalLabels);
    }

    if (Array.isArray(eventAssignmentSource) && eventAssignmentSource.length > 0) {
      const eventLabels = eventAssignmentSource
        .map((assignment) => {
          const roleLabel = assignment?.roleName || assignment?.role?.name || "Role";
          const eventLabel = assignment?.eventName || assignment?.eventId || "Event";
          return `${roleLabel} (${eventLabel})`;
        })
        .filter(Boolean);
      labels.push(...eventLabels);
    }

    const uniqueLabels = Array.from(new Set(labels));
    if (uniqueLabels.length > 0) {
      return uniqueLabels;
    }

    if (recognisedRoles.length > 0) {
      return recognisedRoles.map((role) => ROLE_LIBRARY[role]?.label || role);
    }
    if (fallbackRoles.length > 0) {
      return fallbackRoles;
    }
    const fallbackAccess = `${accessInfo.role} - ${accessInfo.level}`;
    return fallbackAccess.trim() ? [fallbackAccess] : [];
  }, [globalAssignmentSource, eventAssignmentSource, recognisedRoles, fallbackRoles, accessInfo]);

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
    const roleSet = new Set(elevatedRoles);
    const entries = ACCESS_GUIDE.filter((entry) => {
      if (entry.key === "viewer") {
        return elevatedRoles.length === 0;
      }
      return roleSet.has(entry.key);
    });
    return entries;
  }, [elevatedRoles]);

  const moduleRoles = useMemo(
    () => recognisedRoles.filter((role) => role !== "admin" && isElevatedRole(role)),
    [recognisedRoles],
  );
  
  const roleDetails = useMemo(() => {
    const details = [];
    const seenKeys = new Set();

    if (Array.isArray(globalAssignmentSource) && globalAssignmentSource.length > 0) {
      const map = new Map();
      globalAssignmentSource.forEach((assignment) => {
        const name = assignment?.roleName || assignment?.role?.name || "Role";
        if (map.has(name)) return;
        const slug = normaliseRoleList(name)[0];
        map.set(name, {
          key: `global:${assignment?.assignmentId || assignment?.roleId || name}`,
          name: `${name} (Global)`,
          description:
            assignment?.roleDescription ||
            (slug && ROLE_LIBRARY[slug]?.description) ||
            "No description available.",
        });
      });
      Array.from(map.values()).forEach((entry) => {
        if (seenKeys.has(entry.key)) return;
        seenKeys.add(entry.key);
        details.push(entry);
      });
    }

    if (Array.isArray(eventAssignmentSource) && eventAssignmentSource.length > 0) {
      eventAssignmentSource.forEach((assignment) => {
        const roleName = assignment?.roleName || assignment?.role?.name || "Role";
        const eventLabel = assignment?.eventName || assignment?.eventId || "Event";
        const key = `event:${assignment?.assignmentId || `${roleName}:${eventLabel}`}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        details.push({
          key,
          name: `${roleName} (${eventLabel})`,
          description:
            assignment?.roleDescription ||
            `Event-scoped role for ${eventLabel}.`,
        });
      });
    }

    if (details.length > 0) {
      return details;
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
  }, [globalAssignmentSource, eventAssignmentSource, recognisedRoles, fallbackRoles]);

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
              ) : (
                <Link to="/login" className="sc-button">
                  Log in
                </Link>
              )
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

            {elevatedRoles.length === 0 ? (
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
