import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Card, Chip, Panel, SectionShell, SectionHeader } from "../components/ui/primitives";
import AppUpdateChecker from "../components/AppUpdateChecker";
import { getCurrentUser, getRoleCatalog } from "../services/userService";
import { supabase } from "../services/supabaseClient";
import {
  CAPTAIN_ACCESS_ROLES,
  EVENT_ACCESS_PERMISSIONS,
  SCOREKEEPER_ACCESS_ROLES,
  TOURNAMENT_DIRECTOR_ACCESS_ROLES,
  getUserRoleSlugs,
  normaliseRoleList,
  userHasAnyPermission,
} from "../utils/accessControl";

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
const ADMIN_ROLE_SLUGS = new Set(["admin", "administrator", "sys_admin"]);

function IconScorekeeper({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconCaptain({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconTournamentDirector({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="6" height="14" rx="1" />
      <rect x="9" y="3" width="6" height="18" rx="1" />
      <rect x="16" y="10" width="6" height="11" rx="1" />
    </svg>
  );
}

function IconAdminTools({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconEventAccess({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// Decorative floral corner artwork (South African protea / gazania frill),
// authored in Inkscape and split into its two clusters so each can be pinned to
// its own corner. Each keeps its natural aspect ratio — it is only scaled and
// positioned — so the card can be any width without distorting the flowers.
// Sized to fit inside an 80%-of-width by 80%-of-height box (object-contain),
// so it is capped by whichever dimension of the panel is smaller and never
// clips or grows unbounded.
const FRILL_TOP_RIGHT_SRC = "/assets/user-access-frill-top-right.svg";
const FRILL_BOTTOM_LEFT_SRC = "/assets/user-access-frill-bottom-left.svg";

function AdminFrill() {
  const common =
    "pointer-events-none absolute h-[70%] w-[70%] select-none object-contain sm:h-[80%] sm:w-[80%]";
  return (
    <>
      <img
        src={FRILL_TOP_RIGHT_SRC}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`${common} right-0 top-0 object-top-right`}
      />
      <img
        src={FRILL_BOTTOM_LEFT_SRC}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`${common} bottom-0 left-0 object-bottom-left`}
      />
    </>
  );
}
const QUICK_ACCESS_TOOLS = [
  {
    key: "scorekeeper",
    label: "Score keeper",
    description: "Open live scoring.",
    to: "/score-keeper",
    roles: SCOREKEEPER_ACCESS_ROLES,
    Icon: IconScorekeeper,
    accent:
      "border-2 border-live-border bg-[rgba(251,113,133,0.22)] text-white! shadow-[0_8px_22px_rgba(251,113,133,0.14)]",
  },
  {
    key: "captain",
    label: "Captain",
    description: "Manage captain workflows.",
    to: "/captain",
    roles: CAPTAIN_ACCESS_ROLES,
    Icon: IconCaptain,
    accent:
      "border-2 border-warning-border bg-[rgba(251,191,36,0.22)] text-white! shadow-[0_8px_22px_rgba(251,191,36,0.14)]",
  },
  {
    key: "tournament-director",
    label: "Tournament director",
    description: "Manage event operations.",
    to: "/tournament-director",
    roles: TOURNAMENT_DIRECTOR_ACCESS_ROLES,
    Icon: IconTournamentDirector,
    accent:
      "border-2 border-admin-border bg-[rgba(192,132,252,0.22)] text-white! shadow-[0_8px_22px_rgba(192,132,252,0.14)]",
  },
  {
    key: "admin-tools",
    label: "Admin tools",
    description: "Open operational admin.",
    to: "/admin",
    requireElevated: true,
    Icon: IconAdminTools,
    accent:
      "border-2 border-admin-border bg-[rgba(192,132,252,0.22)] text-white! shadow-[0_8px_22px_rgba(192,132,252,0.14)]",
  },
  {
    key: "event-access-control",
    label: "Event access control",
    description: "Manage event-linked access.",
    to: "/admin/event-access",
    permissions: EVENT_ACCESS_PERMISSIONS,
    Icon: IconEventAccess,
    accent:
      "border-2 border-admin-border bg-[rgba(192,132,252,0.22)] text-white! shadow-[0_8px_22px_rgba(192,132,252,0.14)]",
  },
];

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

function hasAnyRole(roleSet, allowedRoles) {
  return normaliseRoleList(allowedRoles).some((role) => roleSet.has(role));
}

function getAssignmentRoleLabel(assignment) {
  const value = assignment?.roleName || assignment?.role?.name || assignment?.roleId || "Role";
  return String(value).trim() || "Role";
}

function getAssignmentEventLabel(assignment) {
  const value = assignment?.eventName || assignment?.event?.name || assignment?.eventId || "Event";
  return String(value).trim() || "Event";
}

function getAssignmentTeamLabel(assignment) {
  const value = assignment?.teamName || assignment?.team?.name || assignment?.teamId || "";
  return String(value).trim();
}

/**
 * Role label for display. Team-scoped grants carry the team so a user can see
 * which team a captain role applies to.
 */
function getScopedAssignmentRoleLabel(assignment) {
  const roleLabel = getAssignmentRoleLabel(assignment);
  const teamLabel = getAssignmentTeamLabel(assignment);
  return teamLabel ? `${roleLabel} - ${teamLabel}` : roleLabel;
}

function compareAlphabetical(a, b) {
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

// The admin grant is surfaced as its own golden badge, so it is filtered out of
// the per-scope chip lists to avoid showing the same role twice.
function isAdminRoleLabel(roleLabel) {
  return normaliseRoleList(roleLabel).some((slug) => ADMIN_ROLE_SLUGS.has(slug));
}

function shouldDisplayAccessRole(roleLabel) {
  const roleSlugs = normaliseRoleList(roleLabel);
  if (roleSlugs.length === 0) return Boolean(String(roleLabel || "").trim());
  return roleSlugs.some((slug) => !NON_ELEVATED_ROLE_SLUGS.has(slug));
}

export default function UserPage() {
  const { session, roles: sessionRoles } = useAuth();
  const user = session?.user || null;
  const [profile, setProfile] = useState(null);
  const [roleCatalog, setRoleCatalog] = useState(null);
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

  useEffect(() => {
    let isCancelled = false;

    if (!user) {
      setRoleCatalog(null);
      return;
    }

    getRoleCatalog()
      .then((catalog) => {
        if (!isCancelled) {
          setRoleCatalog(Array.isArray(catalog) ? catalog : []);
        }
      })
      .catch((error) => {
        console.error("[UserPage] Unable to load role catalog", error);
        if (!isCancelled) {
          setRoleCatalog([]);
        }
      });

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

  const teamAssignmentSource = useMemo(() => {
    if (Array.isArray(profile?.teamRoles) && profile.teamRoles.length > 0) {
      return profile.teamRoles;
    }
    if (Array.isArray(sessionRoles) && sessionRoles.length > 0) {
      return sessionRoles.filter((assignment) => assignment?.scope === "team");
    }
    return [];
  }, [profile?.teamRoles, sessionRoles]);

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

    [...eventAssignmentSource, ...teamAssignmentSource].forEach((assignment) => {
      const roleValue =
        assignment?.roleName || assignment?.role?.name || assignment?.roleId || "";
      normaliseRoleList(roleValue).forEach((role) => collected.add(role));
    });

    return Array.from(collected);
  }, [
    globalAssignmentSource,
    fallbackRoleSource,
    eventAssignmentSource,
    teamAssignmentSource,
    user,
  ]);

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

  const roleAssignmentsForAccess = useMemo(() => {
    if (Array.isArray(sessionRoles) && sessionRoles.length > 0) {
      return sessionRoles;
    }

    return [
      ...(Array.isArray(globalAssignmentSource) ? globalAssignmentSource : []),
      ...(Array.isArray(eventAssignmentSource) ? eventAssignmentSource : []),
      ...(Array.isArray(teamAssignmentSource) ? teamAssignmentSource : []),
    ];
  }, [eventAssignmentSource, teamAssignmentSource, globalAssignmentSource, sessionRoles]);

  const accessLevelLabels = useMemo(() => {
    const labels = [];

    if (Array.isArray(globalAssignmentSource)) {
      const globalLabels = globalAssignmentSource
        .map((assignment) => getAssignmentRoleLabel(assignment))
        .filter(Boolean)
        .map((name) => `${name} (Global)`)
        .sort(compareAlphabetical);
      labels.push(...globalLabels);
    }

    const scopedAssignments = [
      ...(Array.isArray(eventAssignmentSource) ? eventAssignmentSource : []),
      ...(Array.isArray(teamAssignmentSource) ? teamAssignmentSource : []),
    ];

    if (scopedAssignments.length > 0) {
      const groupedByEvent = new Map();
      scopedAssignments.forEach((assignment) => {
        const eventLabel = getAssignmentEventLabel(assignment);
        const roleLabel = getScopedAssignmentRoleLabel(assignment);
        const roles = groupedByEvent.get(eventLabel) || new Set();
        roles.add(roleLabel);
        groupedByEvent.set(eventLabel, roles);
      });

      const eventLabels = Array.from(groupedByEvent.entries())
        .sort((a, b) => compareAlphabetical(a[0], b[0]))
        .map(([eventLabel, roleSet]) => {
          const sortedRoles = Array.from(roleSet).sort(compareAlphabetical);
          return `${eventLabel}: ${sortedRoles.join(", ")}`;
        });
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
  }, [
    globalAssignmentSource,
    eventAssignmentSource,
    teamAssignmentSource,
    recognisedRoles,
    fallbackRoles,
    accessInfo,
  ]);

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

  const accessLevelGroups = useMemo(() => {
    const groups = new Map();

    // Event and team grants both group under their event; team grants carry
    // the team name so "Captain - Metanoia (M)" reads unambiguously.
    const scopedAssignments = [
      ...(Array.isArray(eventAssignmentSource) ? eventAssignmentSource : []),
      ...(Array.isArray(teamAssignmentSource) ? teamAssignmentSource : []),
    ];

    if (scopedAssignments.length > 0) {
      scopedAssignments.forEach((assignment) => {
        const eventLabel = getAssignmentEventLabel(assignment);
        const roleLabel = getScopedAssignmentRoleLabel(assignment);
        if (!shouldDisplayAccessRole(getAssignmentRoleLabel(assignment))) return;
        const roles = groups.get(eventLabel) || new Set();
        roles.add(roleLabel);
        groups.set(eventLabel, roles);
      });
    }

    if (groups.size > 0) {
      return Array.from(groups.entries())
        .sort((a, b) => compareAlphabetical(a[0], b[0]))
        .map(([topic, roleSet]) => ({
          topic,
          roles: Array.from(roleSet).sort(compareAlphabetical),
        }));
    }

    if (Array.isArray(globalAssignmentSource) && globalAssignmentSource.length > 0) {
      const globalRoles = globalAssignmentSource
        .map((assignment) => getAssignmentRoleLabel(assignment))
        .filter((roleLabel) => shouldDisplayAccessRole(roleLabel))
        .sort(compareAlphabetical);
      const uniqueGlobalRoles = Array.from(new Set(globalRoles));
      if (uniqueGlobalRoles.length > 0) {
        return [{ topic: "Global", roles: uniqueGlobalRoles }];
      }
    }

    if (accessLevelLabels.length > 0) {
      return [{ topic: "General", roles: accessLevelLabels }];
    }

    return [{ topic: "General", roles: [`${accessInfo.role} - ${accessInfo.level}`] }];
  }, [
    eventAssignmentSource,
    teamAssignmentSource,
    globalAssignmentSource,
    accessLevelLabels,
    accessInfo.role,
    accessInfo.level,
  ]);

  const moduleRoles = useMemo(
    () => recognisedRoles.filter((role) => role !== "admin" && isElevatedRole(role)),
    [recognisedRoles],
  );

  const hasAdminRole = useMemo(
    () => normalizedRoles.some((role) => ADMIN_ROLE_SLUGS.has(role)),
    [normalizedRoles],
  );

  const quickAccessTools = useMemo(() => {
    const roleSet = new Set(normalizedRoles);
    return QUICK_ACCESS_TOOLS.filter((tool) => {
      if (hasAdminRole) return true;
      if (tool.requireElevated) return elevatedRoles.length > 0;
      if (tool.permissions) {
        return userHasAnyPermission(
          user,
          tool.permissions,
          roleAssignmentsForAccess,
          roleCatalog,
        );
      }
      return hasAnyRole(roleSet, tool.roles);
    });
  }, [elevatedRoles.length, hasAdminRole, normalizedRoles, roleAssignmentsForAccess, roleCatalog, user]);

  const profileEntries = useMemo(() => {
    if (!user) return [];
    const metadata = user.user_metadata || {};
    const accessLabel = "Access levels";
    return [
      {
        label: "Full name",
        value: profile?.full_name || metadata.full_name || metadata.name || "Unknown",
      },
      { label: "Email", value: profile?.email || user.email || "Unknown" },
      {
        label: accessLabel,
        groups: accessLevelGroups,
        isAccessGroupedList: true,
      },
      { label: "Created", value: formatDate(user.created_at) },
    ];
  }, [user, accessLevelGroups, profile]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell className="space-y-3 sm:space-y-6">
        <Card className="space-y-3 p-4 sm:space-y-5 sm:p-7">
          <SectionHeader
            eyebrow="Account overview"
            title={displayName}
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
            <Panel variant="muted" className="p-3 text-sm text-ink-muted sm:p-4">
              Loading your dashboard profile...
            </Panel>
          )}
          {profileError && (
            <Panel variant="muted" className="p-3 text-sm text-ink sm:p-4">
              {profileError}
            </Panel>
          )}
        </Card>

        <section className="space-y-3 border-t border-border pt-3 sm:space-y-4 sm:pt-5">
          {!user ? (
            <p className="text-sm text-ink-muted">You are not signed in. Log in to view your profile information.</p>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {/* Compact key-value rows for simple fields */}
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                {profileEntries.filter((e) => !e.isAccessGroupedList).map((entry) => (
                  <div key={entry.label} className="flex items-baseline gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">{entry.label}</span>
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{entry.value}</span>
                  </div>
                ))}
              </div>
              {/* Full-width featured panel for access levels */}
              {profileEntries.filter((e) => e.isAccessGroupedList).map((entry) => (
                hasAdminRole ? (
                  // Admins get the same Access levels panel, dressed with the
                  // floral frill and led by a golden Admin badge.
                  <Panel
                    key={entry.label}
                    variant="tinted"
                    className="relative isolate overflow-hidden border-2 border-admin-border bg-[#216235] p-4 pb-14 text-sm sm:p-5 sm:pb-12"
                  >
                    <AdminFrill />
                    <div className="relative">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white">
                        Your access
                      </p>
                      <div className="space-y-3 px-6 pb-4 text-center sm:px-0 sm:pb-0">
                        <span className="inline-flex items-center rounded-full border border-[#c8901a] bg-gradient-to-b from-[#e8b533] to-[#c8901a] px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                          Admin
                        </span>
                        {(entry.groups || [])
                          .map((group) => ({
                            ...group,
                            roles: (group.roles || []).filter((role) => !isAdminRoleLabel(role)),
                          }))
                          .filter((group) => group.roles.length > 0)
                          .map((group) => (
                          <div key={`${entry.label}-${group.topic}`}>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                              {group.topic}
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {group.roles.map((role) => (
                                <Chip
                                  key={`${entry.label}-${group.topic}-${role}`}
                                  variant="ghost"
                                  className="border-white/40 bg-white/10 text-xs text-white"
                                >
                                  {role}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>
                ) : (
                  <Panel key={entry.label} variant="muted" className="p-4 text-sm sm:p-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{entry.label}</p>
                    <div className="space-y-3">
                      {(entry.groups || []).map((group) => (
                        <div key={`${entry.label}-${group.topic}`}>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-accent">{group.topic}</p>
                          <div className="flex flex-wrap gap-2">
                            {(group.roles || []).map((role) => (
                              <Chip key={`${entry.label}-${group.topic}-${role}`} variant="ghost" className="text-xs">
                                {role}
                              </Chip>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )
              ))}            </div>
          )}
        </section>

        {quickAccessTools.length > 0 ? (
          <section className="space-y-3 border-t border-border pt-3 sm:space-y-4 sm:pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Quick access</p>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              {quickAccessTools.map((tool) => (
                <Link
                  key={tool.key}
                  to={tool.to}
                  className={`group flex items-center gap-3 overflow-hidden rounded-2xl border-2 px-4 py-3 transition hover:brightness-110 ${tool.accent}`}
                >
                  <tool.Icon className="h-8 w-8 shrink-0 opacity-80" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{tool.label}</p>
                    <p className="text-xs font-medium opacity-75">{tool.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <AppUpdateChecker />

        {user ? (
          <>
            {elevatedRoles.length === 0 ? (
              <section className="border-t border-border pt-3 text-sm text-ink-muted sm:pt-5">
                You currently have viewer-level access. Reach out to an administrator if you require elevated permissions for officiating duties.
              </section>
            ) : moduleRoles.length > 0 ? (
              moduleRoles.map((role) => {
                const module = ROLE_LIBRARY[role];
                return (
                  <section key={role} className="space-y-3 border-t border-border pt-3 sm:space-y-4 sm:pt-5">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
                      <div className="space-y-1.5 sm:space-y-2">
                        <h3 className="text-xl font-semibold text-ink">{module.label}</h3>
                        <p className="text-sm text-ink-muted">{module.description}</p>
                      </div>
                      <Chip variant="ghost" className="uppercase tracking-wide">
                        {role.replace(/_/g, " ")}
                      </Chip>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {module.actions.map((action) => (
                        <Panel key={action} variant="muted" className="p-3 text-sm text-ink sm:p-4">
                          {action}
                        </Panel>
                      ))}
                    </div>
                  </section>
                );
              })
            ) : null}

            <section className="space-y-3 border-t border-border pt-3 sm:space-y-4 sm:pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                <SectionHeader
                  title="Need help?"
                  description="Reach out if you hit an issue, need access changes, or have general questions."
                />
                <img
                  src="/assets/RCFD Logo (light).png"
                  alt="RCDF logo"
                  className="h-14 w-auto object-contain p-1 sm:h-20"
                  loading="lazy"
                />
              </div>
              <div className="grid gap-3 text-sm sm:gap-4">
                <Panel variant="muted" className="flex flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
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
            </section>
          </>
        ) : null}
      </SectionShell>
    </div>
  );
}
