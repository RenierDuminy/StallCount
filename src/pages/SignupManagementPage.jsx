import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Chip,
  Field,
  Input,
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

const LIST_NAME_COLUMN_CANDIDATES = ["name"];
const LIST_SURNAME_COLUMN_CANDIDATES = ["surname", "last name", "last_name"];
const LIST_DOB_COLUMN_CANDIDATES = ["date of birth", "dob"];

function formatEventRange(startDate, endDate) {
  const start = startDate ? new Date(startDate).toLocaleDateString() : null;
  const end = endDate ? new Date(endDate).toLocaleDateString() : null;
  if (start && end) return `${start} - ${end}`;
  return start || end || "Dates TBD";
}

function normalizeHeaderName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePersonName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(value, slashDateMode = "auto") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const directIso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (directIso) {
    const year = Number(directIso[1]);
    const month = Number(directIso[2]);
    const day = Number(directIso[3]);
    if (isValidDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const dottedOrSlashed = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dottedOrSlashed) {
    const first = Number(dottedOrSlashed[1]);
    const second = Number(dottedOrSlashed[2]);
    const year = Number(dottedOrSlashed[3]);
    let mode = slashDateMode;
    if (mode === "auto") {
      if (first > 12 && second <= 12) {
        mode = "dmy";
      } else if (second > 12 && first <= 12) {
        mode = "mdy";
      } else {
        mode = "dmy";
      }
    }

    let month = mode === "dmy" ? second : first;
    let day = mode === "dmy" ? first : second;

    if (isValidDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return "";
}

function levenshteinDistance(leftInput, rightInput) {
  const left = String(leftInput || "");
  const right = String(rightInput || "");
  const leftLength = left.length;
  const rightLength = right.length;

  if (leftLength === 0) return rightLength;
  if (rightLength === 0) return leftLength;

  const matrix = Array.from({ length: leftLength + 1 }, () =>
    new Array(rightLength + 1).fill(0)
  );

  for (let i = 0; i <= leftLength; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= rightLength; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= leftLength; i += 1) {
    for (let j = 1; j <= rightLength; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[leftLength][rightLength];
}

function isValidDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const test = new Date(Date.UTC(year, month - 1, day));
  return (
    test.getUTCFullYear() === year &&
    test.getUTCMonth() === month - 1 &&
    test.getUTCDate() === day
  );
}

function createUniqueHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((header, index) => {
    const base =
      String(header || "")
        .trim()
        .replace(/\s+/g, " ") || `column_${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.length > 1 || row.some((cell) => String(cell || "").trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function parseCsvText(rawText) {
  const text = String(rawText || "").replace(/^\uFEFF/, "");
  const commaRows = parseDelimitedRows(text, ",");
  const semicolonRows =
    commaRows.length > 0 &&
    commaRows[0].length <= 1 &&
    text.includes(";")
      ? parseDelimitedRows(text, ";")
      : [];

  const rows = semicolonRows.length > commaRows.length ? semicolonRows : commaRows;
  if (!rows.length) {
    return { headers: [], rows: [] };
  }

  const headers = createUniqueHeaders(rows[0]);
  const dataRows = rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim() !== ""));
  const mappedRows = dataRows.map((values) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = String(values[index] || "").trim();
    });
    return entry;
  });

  return { headers, rows: mappedRows };
}

function detectColumn(headers, candidates) {
  const normalizedCandidates = new Set(candidates.map((value) => normalizeHeaderName(value)));
  return (
    headers.find((header) => normalizedCandidates.has(normalizeHeaderName(header))) ||
    ""
  );
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
  const [selectedEventId, setSelectedEventId] = useState("");

  const [rosterRows, setRosterRows] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");

  const [csvUrl, setCsvUrl] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [externalRows, setExternalRows] = useState([]);
  const [externalHeaders, setExternalHeaders] = useState([]);
  const [listNameColumn, setListNameColumn] = useState("");
  const [listSurnameColumn, setListSurnameColumn] = useState("");
  const [listDobColumn, setListDobColumn] = useState("");
  const [dobInputMode, setDobInputMode] = useState("auto");

  useEffect(() => {
    if (!userId) {
      setEventOptions([]);
      setSelectedEventId("");
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
          error instanceof Error ? error.message : "Unable to load tournament director event scope."
        );
        setEventOptions([]);
        setSelectedEventId("");
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
  }, [hasAdminAccess, roleCatalog, scopedSignupPermissionKeys, userId]);

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
    [eventOptions, selectedEventId]
  );

  const rosterPlayers = useMemo(
    () =>
      rosterRows
        .map((entry) => ({
          rosterId: entry.id,
          teamName: entry.team?.name || "Team",
          playerName: entry.player?.name || "",
          playerBirthday: toIsoDate(entry.player?.birthday),
        }))
        .filter((entry) => Boolean(entry.playerName)),
    [rosterRows]
  );

  const inferredDobMode = useMemo(() => {
    if (!listDobColumn) return "dmy";
    let dmyEvidence = 0;
    let mdyEvidence = 0;
    externalRows.forEach((row) => {
      const raw = String(row[listDobColumn] || "").trim();
      const match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (!match) return;
      const first = Number(match[1]);
      const second = Number(match[2]);
      if (first > 12 && second <= 12) {
        dmyEvidence += 1;
      } else if (second > 12 && first <= 12) {
        mdyEvidence += 1;
      }
    });
    if (mdyEvidence > dmyEvidence) return "mdy";
    return "dmy";
  }, [externalRows, listDobColumn]);

  const resolvedDobMode = dobInputMode === "auto" ? inferredDobMode : dobInputMode;

  const externalRecords = useMemo(() => {
    if (!listNameColumn || !listSurnameColumn || !listDobColumn) return [];

    const resolveName = (row) => {
      const first = String(row[listNameColumn] || "").trim();
      const last = String(row[listSurnameColumn] || "").trim();
      return [first, last].filter(Boolean).join(" ").trim();
    };

    return externalRows.map((row) => ({
      name: resolveName(row),
      birthday: toIsoDate(row[listDobColumn] || "", resolvedDobMode),
      key: `${normalizePersonName(resolveName(row))}::${toIsoDate(
        row[listDobColumn] || "",
        resolvedDobMode
      )}`,
    }));
  }, [
    externalRows,
    listDobColumn,
    listNameColumn,
    listSurnameColumn,
    resolvedDobMode,
  ]);

  const externalKeySet = useMemo(() => {
    const set = new Set();
    externalRecords.forEach((record) => {
      const [namePart, dobPart] = String(record.key || "").split("::");
      if (!namePart || !dobPart) return;
      set.add(record.key);
    });
    return set;
  }, [externalRecords]);

  const externalRecordsByDob = useMemo(() => {
    const map = new Map();
    externalRecords.forEach((record) => {
      const dob = record.birthday;
      if (!dob) return;
      if (!map.has(dob)) {
        map.set(dob, []);
      }
      map.get(dob).push(record);
    });
    return map;
  }, [externalRecords]);

  const comparedPlayers = useMemo(() => {
    return rosterPlayers
      .map((player) => {
        const namePart = normalizePersonName(player.playerName);
        const dobPart = toIsoDate(player.playerBirthday);
        const key = `${namePart}::${dobPart}`;
        const isMatch = Boolean(namePart && dobPart && externalKeySet.has(key));
        const sameDobCandidates = dobPart ? externalRecordsByDob.get(dobPart) || [] : [];
        const closestOptions = sameDobCandidates
          .map((candidate) => ({
            name: candidate.name,
            normalizedName: normalizePersonName(candidate.name),
          }))
          .filter((candidate) => candidate.normalizedName)
          .map((candidate) => ({
            ...candidate,
            distance: levenshteinDistance(namePart, candidate.normalizedName),
          }))
          .sort((left, right) => {
            if (left.distance !== right.distance) return left.distance - right.distance;
            return left.name.localeCompare(right.name);
          })
          .slice(0, 3)
          .map((candidate) => candidate.name);
        return {
          ...player,
          isMatch,
          closestOptions,
          reason: !dobPart
            ? "Missing DOB in roster"
            : sameDobCandidates.length > 0
              ? "Name mismatch (DOB exists in external list)"
              : "DOB not found in external list",
        };
      })
      .sort((left, right) => {
        const teamDiff = left.teamName.localeCompare(right.teamName);
        if (teamDiff !== 0) return teamDiff;
        return left.playerName.localeCompare(right.playerName);
      });
  }, [rosterPlayers, externalKeySet, externalRecordsByDob]);

  const missingPlayers = useMemo(() => {
    return comparedPlayers
      .filter((player) => !player.isMatch)
      .map((player) => ({ ...player }));
  }, [comparedPlayers]);

  const matchedPlayers = useMemo(() => {
    return comparedPlayers
      .filter((player) => player.isMatch)
      .map((player) => ({ ...player }));
  }, [comparedPlayers]);

  const handleImportCsv = async (event) => {
    event.preventDefault();
    const url = csvUrl.trim();
    if (!url) {
      setCsvError("Provide a CSV URL first.");
      return;
    }

    setCsvImporting(true);
    setCsvError("");
    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Unable to fetch CSV (${response.status}).`);
      }
      const text = await response.text();
      const parsed = parseCsvText(text);
      if (!parsed.headers.length) {
        throw new Error("CSV appears to be empty.");
      }
      if (!parsed.rows.length) {
        throw new Error("CSV has no data rows.");
      }
      setExternalHeaders(parsed.headers);
      setExternalRows(parsed.rows);

      const detectedName = detectColumn(parsed.headers, LIST_NAME_COLUMN_CANDIDATES);
      const detectedSurname = detectColumn(parsed.headers, LIST_SURNAME_COLUMN_CANDIDATES);
      const detectedDob = detectColumn(parsed.headers, LIST_DOB_COLUMN_CANDIDATES);

      setListNameColumn(detectedName || parsed.headers[0] || "");
      setListSurnameColumn(
        detectedSurname ||
          parsed.headers.find((header) => header !== (detectedName || parsed.headers[0] || "")) ||
          parsed.headers[0] ||
          ""
      );
      setListDobColumn(detectedDob || parsed.headers[0] || "");
    } catch (error) {
      setCsvError(
        error instanceof Error
          ? error.message
          : "Unable to import CSV. Confirm URL access and CORS settings."
      );
      setExternalHeaders([]);
      setExternalRows([]);
      setListNameColumn("");
      setListSurnameColumn("");
      setListDobColumn("");
      setDobInputMode("auto");
    } finally {
      setCsvImporting(false);
    }
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
            description="Compare event roster players against an external signup CSV by name and date of birth."
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
              Roster players: {rosterPlayers.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              External rows: {externalRows.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Missing: {missingPlayers.length}
            </Chip>
            <Chip variant="ghost" className="text-xs text-ink-muted">
              Matched: {matchedPlayers.length}
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
              <span className="font-semibold uppercase tracking-wide text-ink-muted">Current scope</span>
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
            eyebrow="External CSV"
            title="Import signup source"
            description="Compare database player name + birthday against list Name + surname + Date of Birth."
          />
          <form className="grid gap-4 md:grid-cols-[1fr_auto]" onSubmit={handleImportCsv}>
            <Field label="CSV URL" hint="The URL must allow browser access (CORS).">
              <Input
                type="url"
                value={csvUrl}
                onChange={(event) => setCsvUrl(event.target.value)}
                placeholder="https://example.com/signup-list.csv"
              />
            </Field>
            <div className="flex items-end">
              <button
                type="submit"
                className="sc-button w-full md:w-auto"
                disabled={csvImporting}
              >
                {csvImporting ? "Importing..." : "Import CSV"}
              </button>
            </div>
          </form>

          {externalHeaders.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name column">
                <Select
                  value={listNameColumn}
                  onChange={(event) => setListNameColumn(event.target.value)}
                >
                  {externalHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Surname column">
                <Select
                  value={listSurnameColumn}
                  onChange={(event) => setListSurnameColumn(event.target.value)}
                >
                  {externalHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date of Birth column">
                <Select
                  value={listDobColumn}
                  onChange={(event) => setListDobColumn(event.target.value)}
                >
                  {externalHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="DOB format">
                <Select
                  value={dobInputMode}
                  onChange={(event) => setDobInputMode(event.target.value)}
                >
                  <option value="auto">
                    Auto ({inferredDobMode === "mdy" ? "MM/DD/YYYY" : "DD/MM/YYYY"})
                  </option>
                  <option value="dmy">DD/MM/YYYY</option>
                  <option value="mdy">MM/DD/YYYY</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {csvError ? (
            <Panel className="border border-rose-300/40 bg-rose-50 p-3 text-sm text-rose-700">
              {csvError}
            </Panel>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionHeader
            eyebrow="Results"
            title="Players missing from external signup list"
            description="Only roster players not found in the imported CSV (name + DOB match) are listed."
          />

          {selectedEventId === "" ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              No scoped event is available for this account.
            </Panel>
          ) : externalRows.length === 0 ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Import a CSV to start the comparison.
            </Panel>
          ) : missingPlayers.length === 0 ? (
            <Panel variant="muted" className="p-4 text-sm text-ink-muted">
              Every roster player appears in the external list.
            </Panel>
          ) : (
            <div className="space-y-5">
              <div className="overflow-x-auto">
                <table className="min-w-full border border-border text-left text-sm">
                  <thead>
                    <tr className="bg-surface-muted text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      <th className="border-b border-border px-3 py-2">Team</th>
                      <th className="border-b border-border px-3 py-2">Player</th>
                      <th className="border-b border-border px-3 py-2">Date of birth</th>
                      <th className="border-b border-border px-3 py-2">Reason</th>
                      <th className="border-b border-border px-3 py-2">Closest options (same DOB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingPlayers.map((player) => (
                      <tr key={player.rosterId} className="border-b border-border/70">
                        <td className="px-3 py-2">{player.teamName}</td>
                        <td className="px-3 py-2">{player.playerName}</td>
                        <td className="px-3 py-2">
                          {player.playerBirthday
                            ? new Date(player.playerBirthday).toLocaleDateString()
                            : "Unknown"}
                        </td>
                        <td className="px-3 py-2 text-ink-muted">{player.reason}</td>
                        <td className="px-3 py-2 text-ink-muted">
                          {player.closestOptions?.length > 0
                            ? player.closestOptions.join(", ")
                            : "None"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">
                  Players appearing on both lists
                </h3>
                {matchedPlayers.length === 0 ? (
                  <Panel variant="muted" className="p-3 text-sm text-ink-muted">
                    No players currently match on both name and date of birth.
                  </Panel>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-border text-left text-sm">
                      <thead>
                        <tr className="bg-surface-muted text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          <th className="border-b border-border px-3 py-2">Team</th>
                          <th className="border-b border-border px-3 py-2">Player</th>
                          <th className="border-b border-border px-3 py-2">Date of birth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchedPlayers.map((player) => (
                          <tr key={`matched-${player.rosterId}`} className="border-b border-border/70">
                            <td className="px-3 py-2">{player.teamName}</td>
                            <td className="px-3 py-2">{player.playerName}</td>
                            <td className="px-3 py-2">
                              {player.playerBirthday
                                ? new Date(player.playerBirthday).toLocaleDateString()
                                : "Unknown"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
