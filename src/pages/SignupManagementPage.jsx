import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Chip,
  Field,
  Panel,
  SectionHeader,
  SectionShell,
  Select,
} from "../components/ui/primitives";
import { useAuth } from "../context/AuthContext";
import { getEventsList } from "../services/leagueService";
import { getEventRosters } from "../services/playerService";
import { getRoleCatalog, getUserEventRoleAssignments } from "../services/userService";
import {
  ADMIN_OVERRIDE_PERMISSIONS,
  normalisePermissionList,
  normaliseRoleList,
  SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS,
  userHasAnyPermission,
} from "../utils/accessControl";
import usePersistentState from "../hooks/usePersistentState";

const SIGNUP_SELECTED_EVENT_KEY = "stallcount:signup-management:selected-event:v1";

function formatEventRange(startDate, endDate) {
  const start = startDate ? new Date(startDate).toLocaleDateString() : null;
  const end = endDate ? new Date(endDate).toLocaleDateString() : null;
  if (start && end) return `${start} - ${end}`;
  return start || end || "Dates TBD";
}

function slugifyFilename(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "event-rosters";
}

function escapeCsvCell(value) {
  const raw = String(value ?? "");
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildRosterCsv(groupedTeams) {
  if (!groupedTeams.length) {
    return "";
  }

  const maxPlayers = groupedTeams.reduce(
    (max, team) => Math.max(max, team.players.length),
    0,
  );
  const rows = [
    groupedTeams.map((team) => escapeCsvCell(team.name)),
    ...Array.from({ length: maxPlayers }, (_, rowIndex) =>
      groupedTeams.map((team) => escapeCsvCell(team.players[rowIndex]?.name || "")),
    ),
  ];

  return rows.map((row) => row.join(",")).join("\r\n");
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getPlayerRoleRank(player) {
  if (player.isCaptain) return 0;
  if (player.isSpiritCaptain) return 1;
  return 2;
}

export default function SignupManagementPage() {
  const { session, roles, rolesLoading } = useAuth();
  const userId = session?.user?.id || null;
  const [roleCatalog, setRoleCatalog] = useState([]);
  const [roleCatalogLoading, setRoleCatalogLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (!session?.user?.id) {
      setRoleCatalog([]);
      setRoleCatalogLoading(false);
      return () => {
        ignore = true;
      };
    }

    const loadRoleCatalog = async () => {
      setRoleCatalogLoading(true);
      try {
        const catalog = await getRoleCatalog();
        if (!ignore) {
          setRoleCatalog(Array.isArray(catalog) ? catalog : []);
        }
      } catch (error) {
        if (!ignore) {
          console.error("[SignupManagement] Failed to load role catalog", error);
          setRoleCatalog([]);
        }
      } finally {
        if (!ignore) {
          setRoleCatalogLoading(false);
        }
      }
    };

    loadRoleCatalog();
    return () => {
      ignore = true;
    };
  }, [session?.user?.id]);

  const hasAdminAccess = useMemo(
    () =>
      userHasAnyPermission(
        session?.user || null,
        ADMIN_OVERRIDE_PERMISSIONS,
        roles,
        roleCatalog,
      ),
    [session?.user, roles, roleCatalog],
  );
  const hasSignupManagementPermission = useMemo(
    () =>
      userHasAnyPermission(
        session?.user || null,
        SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS,
        roles,
        roleCatalog,
      ),
    [session?.user, roles, roleCatalog],
  );
  const scopedSignupPermissionKeys = useMemo(
    () =>
      new Set(
        normalisePermissionList(SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS).filter(
          (key) => key !== "admin_override",
        ),
      ),
    [],
  );

  const [eventOptions, setEventOptions] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [selectedEventId, setSelectedEventId] = usePersistentState(
    SIGNUP_SELECTED_EVENT_KEY,
    "",
  );

  const [rosterRows, setRosterRows] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");

  useEffect(() => {
    if (!userId) {
      setEventOptions([]);
      setEventsError("");
      return;
    }

    let ignore = false;
    const loadEventScope = async () => {
      setEventsLoading(true);
      setEventsError("");
      try {
        if (hasAdminAccess) {
          const events = await getEventsList(200);
          if (ignore) return;
          const normalizedEvents = (Array.isArray(events) ? events : []).map((event) => ({
            id: event.id,
            name: event.name || "Event",
            startDate: event.start_date || null,
            endDate: event.end_date || null,
          }));
          setEventOptions(normalizedEvents);
          setSelectedEventId((prev) => {
            if (prev && normalizedEvents.some((event) => event.id === prev)) {
              return prev;
            }
            return normalizedEvents[0]?.id || "";
          });
          return;
        }

        const assignments = await getUserEventRoleAssignments(userId);
        if (ignore) return;

        const scopedEventMap = new Map();
        assignments
          .filter((assignment) => {
            if (!assignment?.eventId) return false;
            const roleFromCatalog = (Array.isArray(roleCatalog) ? roleCatalog : []).find((role) => {
              if (assignment?.roleId !== null && assignment?.roleId !== undefined) {
                return String(role.id) === String(assignment.roleId);
              }
              const assignmentRoleSlug = normaliseRoleList(assignment?.roleName || "")[0] || "";
              const roleSlug = normaliseRoleList(role?.name || "")[0] || "";
              return assignmentRoleSlug && roleSlug && assignmentRoleSlug === roleSlug;
            });
            if (!roleFromCatalog) return false;
            const rolePermissionKeys = normalisePermissionList(
              (Array.isArray(roleFromCatalog.permissions) ? roleFromCatalog.permissions : []).map(
                (permission) =>
                  (typeof permission === "string"
                    ? permission
                    : permission?.key || permission?.name || permission?.value || ""),
              ),
            );
            return rolePermissionKeys.some((key) => scopedSignupPermissionKeys.has(key));
          })
          .forEach((assignment) => {
            const eventId = assignment.eventId;
            if (scopedEventMap.has(eventId)) return;
            scopedEventMap.set(eventId, {
              id: eventId,
              name: assignment.eventName || "Event",
              startDate: assignment.eventStartDate || null,
              endDate: assignment.eventEndDate || null,
            });
          });

        const scopedEvents = Array.from(scopedEventMap.values());
        setEventOptions(scopedEvents);
        setSelectedEventId((prev) => {
          if (prev && scopedEvents.some((event) => event.id === prev)) {
            return prev;
          }
          return scopedEvents[0]?.id || "";
        });
      } catch (error) {
        if (ignore) return;
        setEventsError(
          error instanceof Error ? error.message : "Unable to load tournament director event scope.",
        );
        setEventOptions([]);
      } finally {
        if (!ignore) {
          setEventsLoading(false);
        }
      }
    };

    loadEventScope();
    return () => {
      ignore = true;
    };
  }, [
    hasAdminAccess,
    roleCatalog,
    scopedSignupPermissionKeys,
    setSelectedEventId,
    userId,
  ]);

  useEffect(() => {
    if (!selectedEventId) {
      setRosterRows([]);
      setRosterError("");
      return;
    }

    let ignore = false;
    const loadRoster = async () => {
      setRosterLoading(true);
      setRosterError("");
      try {
        const data = await getEventRosters(selectedEventId);
        if (!ignore) {
          setRosterRows(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!ignore) {
          setRosterError(error instanceof Error ? error.message : "Unable to load event roster.");
          setRosterRows([]);
        }
      } finally {
        if (!ignore) {
          setRosterLoading(false);
        }
      }
    };

    loadRoster();
    return () => {
      ignore = true;
    };
  }, [selectedEventId]);

  const selectedEvent = useMemo(
    () => eventOptions.find((event) => event.id === selectedEventId) || null,
    [eventOptions, selectedEventId],
  );

  const groupedTeams = useMemo(() => {
    const map = new Map();
    rosterRows.forEach((entry) => {
      const teamId = entry.team?.id || entry.team_id;
      if (!teamId) return;
      if (!map.has(teamId)) {
        map.set(teamId, {
          teamId,
          name: entry.team?.name || "Team",
          shortName: entry.team?.short_name || "",
          players: [],
        });
      }
      map.get(teamId).players.push({
        id: entry.player?.id || entry.id,
        name: entry.player?.name || "Player",
        jersey: entry.player?.jersey_number ?? null,
        isCaptain: Boolean(entry.is_captain),
        isSpiritCaptain: Boolean(entry.is_spirit_captain),
      });
    });

    const teams = Array.from(map.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    teams.forEach((team) => {
      team.players.sort((left, right) => {
        const roleDiff = getPlayerRoleRank(left) - getPlayerRoleRank(right);
        if (roleDiff !== 0) return roleDiff;
        const jerseyLeft = Number.isFinite(Number(left.jersey)) ? Number(left.jersey) : null;
        const jerseyRight = Number.isFinite(Number(right.jersey)) ? Number(right.jersey) : null;
        if (jerseyLeft !== null && jerseyRight !== null && jerseyLeft !== jerseyRight) {
          return jerseyLeft - jerseyRight;
        }
        return left.name.localeCompare(right.name);
      });
    });
    return teams;
  }, [rosterRows]);

  const rosterPlayerCount = useMemo(
    () => groupedTeams.reduce((total, team) => total + team.players.length, 0),
    [groupedTeams],
  );
  const maxPlayers = useMemo(
    () => groupedTeams.reduce((max, team) => Math.max(max, team.players.length), 0),
    [groupedTeams],
  );

  const handleDownloadRosterCsv = () => {
    if (!groupedTeams.length) return;
    const csvText = buildRosterCsv(groupedTeams);
    const filename = `${slugifyFilename(selectedEvent?.name)}-rosters.csv`;
    downloadTextFile(filename, csvText, "text/csv;charset=utf-8");
  };

  if (rolesLoading || roleCatalogLoading) {
    return (
      <SectionShell className="py-10">
        <Panel variant="muted" className="p-4 text-sm text-ink-muted">
          Checking access...
        </Panel>
      </SectionShell>
    );
  }

  if (!hasAdminAccess && !hasSignupManagementPermission) {
    return (
      <SectionShell className="py-10">
        <Panel className="border border-rose-300/40 bg-rose-50 p-4 text-sm text-rose-700">
          Access restricted. Signup management requires roster or player permissions.
        </Panel>
      </SectionShell>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Admin"
            title="Signup management"
            description="Download event roster players from the database as a CSV with one column per team."
            action={
              <Link to="/admin" className="sc-button">
                Admin hub
              </Link>
            }
          />
          <div className="flex flex-wrap gap-2">
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Scoped events: {eventOptions.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Teams: {groupedTeams.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Roster players: {rosterPlayerCount}
            </Chip>
          </div>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-5 pb-16">
        <Card className="space-y-4 p-5">
          <SectionHeader
            eyebrow="Scope"
            title="Event access scope"
            description={
              hasAdminAccess
                ? "Admin access is global. You can select any event."
                : "Only events where you hold event-scoped roster or player permissions are available."
            }
            action={
              <button
                type="button"
                className="sc-button"
                onClick={handleDownloadRosterCsv}
                disabled={!selectedEventId || rosterLoading || groupedTeams.length === 0}
              >
                Download CSV
              </button>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Event">
              <Select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                disabled={eventsLoading || eventOptions.length === 0}
              >
                <option value="">
                  {eventOptions.length === 0 ? "No linked event" : "Select event"}
                </option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Panel className="flex flex-col justify-center p-4 text-xs">
              <span className="font-semibold uppercase tracking-wide text-ink-muted">
                Current scope
              </span>
              {selectedEvent ? (
                <span className="text-sm text-ink">
                  {selectedEvent.name} ({formatEventRange(selectedEvent.startDate, selectedEvent.endDate)})
                </span>
              ) : (
                <span className="text-sm text-ink-muted">No event available for this user.</span>
              )}
            </Panel>
          </div>
          {eventsError ? (
            <Panel className="border border-rose-300/40 bg-rose-50 p-3 text-sm text-rose-700">
              {eventsError}
            </Panel>
          ) : null}
          {rosterError ? (
            <Panel className="border border-rose-300/40 bg-rose-50 p-3 text-sm text-rose-700">
              {rosterError}
            </Panel>
          ) : null}
          {rosterLoading ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Loading roster...
            </Panel>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionHeader
            eyebrow="Roster CSV"
            title="Export preview"
            description="The downloaded CSV uses team names as column headers and lists each linked player underneath."
          />

          {selectedEventId === "" ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              No scoped event is available for this account.
            </Panel>
          ) : rosterLoading ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Loading roster...
            </Panel>
          ) : groupedTeams.length === 0 ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              No roster entries were found for this event.
            </Panel>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto border border-border text-left text-sm text-ink">
                <thead>
                  <tr className="bg-surface-muted text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {groupedTeams.map((team) => (
                      <th
                        key={team.teamId}
                        className="border-b border-border px-3 py-2 text-center whitespace-nowrap"
                      >
                        <div className="text-sm font-semibold text-ink">{team.name}</div>
                        {team.shortName ? (
                          <div className="text-[11px] uppercase tracking-wide text-ink-muted">
                            {team.shortName}
                          </div>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPlayers }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {groupedTeams.map((team) => {
                        const player = team.players[rowIndex];
                        return (
                          <td
                            key={`${team.teamId}-${rowIndex}`}
                            className="border-x border-border px-3 py-1.5 align-top whitespace-nowrap"
                          >
                            {player ? (
                              <span className="text-sm text-ink">{player.name}</span>
                            ) : (
                              <span className="text-xs text-ink-muted"></span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
