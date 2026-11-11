import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getEventsList } from "../services/leagueService";
import { getRoleCatalog } from "../services/userService";
import { getMatchesByEvent, updateMatchMediaLink } from "../services/matchService";
import { getTeamsLinkedToEvent, updateTeamAttributes } from "../services/teamService";
import { Card, SectionHeader, SectionShell, Field, Input, Select, Textarea } from "../components/ui/primitives";
import usePersistentState from "../hooks/usePersistentState";
import { userHasAnyPermission } from "../utils/accessControl";

const MEDIA_SELECTED_EVENT_KEY = "stallcount:media-admin:selected-event:v1";
const MEDIA_FORM_KEY = "stallcount:media-admin:form:v1";
const MEDIA_EDITING_TEAM_KEY = "stallcount:media-admin:editing-team:v1";
const MEDIA_TEAM_COLOR_FORM_KEY = "stallcount:media-admin:team-color-form:v1";
const STREAMING_COLOR_FIELDS = [
  "accentColor",
  "primaryColor",
  "textOnPrimary",
  "secondaryColor",
  "textOnSecondary",
];

export default function MediaAdminPage() {
  const { session, roles, rolesLoading } = useAuth();
  const [events, setEvents] = useState([]);
  const [eventError, setEventError] = useState("");
  const [selectedEventId, setSelectedEventId] = usePersistentState(MEDIA_SELECTED_EVENT_KEY, "");
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState("");
  const [form, setForm] = usePersistentState(MEDIA_FORM_KEY, createEmptyForm);
  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [resultError, setResultError] = useState("");
  const [eventTeams, setEventTeams] = useState([]);
  const [eventTeamsLoading, setEventTeamsLoading] = useState(false);
  const [eventTeamsError, setEventTeamsError] = useState("");
  const [editingTeamId, setEditingTeamId] = usePersistentState(MEDIA_EDITING_TEAM_KEY, "");
  const [selectedTeamId, setSelectedTeamId] = useState(editingTeamId || "");
  const [teamColorForm, setTeamColorForm] = usePersistentState(
    MEDIA_TEAM_COLOR_FORM_KEY,
    createEmptyTeamColorForm,
  );
  const [teamColorSaving, setTeamColorSaving] = useState(false);
  const [teamColorError, setTeamColorError] = useState("");
  const [roleCatalog, setRoleCatalog] = useState([]);
  const [roleCatalogLoading, setRoleCatalogLoading] = useState(false);
  const previousEventIdRef = useRef(selectedEventId);

  useEffect(() => {
    async function loadEvents() {
      setEventError("");
      try {
        const list = await getEventsList(200);
        setEvents(list ?? []);
      } catch (err) {
        setEventError(err instanceof Error ? err.message : "Unable to load events.");
      }
    }
    loadEvents();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadRoleCatalog() {
      setRoleCatalogLoading(true);
      try {
        const catalog = await getRoleCatalog();
        if (!ignore) {
          setRoleCatalog(Array.isArray(catalog) ? catalog : []);
        }
      } catch (err) {
        if (!ignore) {
          console.error("[MediaAdminPage] Unable to load role catalog:", err);
          setRoleCatalog([]);
        }
      } finally {
        if (!ignore) {
          setRoleCatalogLoading(false);
        }
      }
    }

    loadRoleCatalog();

    return () => {
      ignore = true;
    };
  }, []);

  const allowedEventIds = useMemo(() => {
    if (!Array.isArray(roles) || roles.length === 0) {
      return new Set();
    }

    const hasGlobalMediaAccess = roles.some((assignment) => {
      if (assignment?.scope === "event" || assignment?.eventId) {
        return false;
      }
      return userHasAnyPermission(session?.user, ["media_edit", "admin_override"], [assignment], roleCatalog);
    });

    if (hasGlobalMediaAccess) {
      return null;
    }

    const scopedEventIds = new Set();
    roles.forEach((assignment) => {
      if (!assignment?.eventId) {
        return;
      }
      if (userHasAnyPermission(session?.user, ["media_edit", "admin_override"], [assignment], roleCatalog)) {
        scopedEventIds.add(String(assignment.eventId));
      }
    });
    return scopedEventIds;
  }, [roleCatalog, roles, session?.user]);

  const availableEvents = useMemo(() => {
    if (allowedEventIds === null) {
      return events;
    }
    return events.filter((event) => allowedEventIds.has(String(event.id)));
  }, [allowedEventIds, events]);

  const selectedEvent = useMemo(
    () => availableEvents.find((event) => String(event.id) === String(selectedEventId)) || null,
    [availableEvents, selectedEventId],
  );

  useEffect(() => {
    if (!selectedEventId) return;
    if (!availableEvents.some((event) => String(event.id) === String(selectedEventId))) {
      setSelectedEventId("");
    }
  }, [availableEvents, selectedEventId, setSelectedEventId]);

  useEffect(() => {
    const eventChanged = previousEventIdRef.current !== selectedEventId;
    previousEventIdRef.current = selectedEventId;

    if (!selectedEventId) {
      setEventTeams([]);
      setEventTeamsError("");
      setEventTeamsLoading(false);
      setEditingTeamId("");
      setTeamColorForm(createEmptyTeamColorForm());
      setTeamColorError("");
      setMatches([]);
      if (eventChanged) {
        setForm(createEmptyForm());
      }
      return;
    }
    let ignore = false;
    async function loadMatches() {
      setMatchesLoading(true);
      setMatchesError("");
      try {
        const rows = await getMatchesByEvent(selectedEventId, 200, { includeFinished: true });
        if (!ignore) {
          const nextMatches = rows ?? [];
          setMatches(nextMatches);
          setForm((prev) => {
            if (eventChanged) {
              return createEmptyForm();
            }
            if (!prev?.matchId) {
              return prev;
            }
            const matchStillExists = nextMatches.some((match) => match.id === prev.matchId);
            return matchStillExists ? prev : createEmptyForm();
          });
        }
      } catch (err) {
        if (!ignore) {
          setMatchesError(err instanceof Error ? err.message : "Unable to load matches.");
          setMatches([]);
        }
      } finally {
        if (!ignore) {
          setMatchesLoading(false);
        }
      }
    }
    loadMatches();
    return () => {
      ignore = true;
    };
  }, [selectedEventId, setForm]);

  useEffect(() => {
    if (!selectedEventId) {
      setEventTeams([]);
      setEventTeamsError("");
      setEventTeamsLoading(false);
      setEditingTeamId("");
      setTeamColorForm(createEmptyTeamColorForm());
      setTeamColorError("");
      return;
    }

    let ignore = false;

    async function loadEventTeams() {
      setEventTeamsLoading(true);
      setEventTeamsError("");
      try {
        const rows = await getTeamsLinkedToEvent(selectedEventId);
        if (!ignore) {
          setEventTeams(rows ?? []);
        }
      } catch (err) {
        if (!ignore) {
          setEventTeams([]);
          setEventTeamsError(err instanceof Error ? err.message : "Unable to load event teams.");
        }
      } finally {
        if (!ignore) {
          setEventTeamsLoading(false);
        }
      }
    }

    loadEventTeams();

    return () => {
      ignore = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!editingTeamId) return;
    const editingTeamStillExists = eventTeams.some((team) => team.id === editingTeamId);
    if (!editingTeamStillExists) {
      setEditingTeamId("");
      setTeamColorForm(createEmptyTeamColorForm());
      setTeamColorError("");
    }
  }, [editingTeamId, eventTeams]);

  const selectedMatch = useMemo(() => {
    return matches.find((match) => match.id === form.matchId) || null;
  }, [form.matchId, matches]);

  const selectedMedia = useMemo(() => {
    return selectedMatch ? parseMediaLink(selectedMatch) : null;
  }, [selectedMatch]);

  const pageStats = useMemo(
    () => [
      {
        label: "Event",
        value: selectedEvent?.name || "No event selected",
        tone: selectedEvent ? "active" : "idle",
      },
      {
        label: "Matches",
        value: selectedEventId ? String(matches.length) : "0",
        tone: matchesLoading ? "loading" : matches.length > 0 ? "active" : "idle",
      },
      {
        label: "Teams",
        value: selectedEventId ? String(eventTeams.length) : "0",
        tone: eventTeamsLoading ? "loading" : eventTeams.length > 0 ? "active" : "idle",
      },
      {
        label: "Media status",
        value: selectedMatch?.has_media ? "Attached" : "Not attached",
        tone: selectedMatch?.has_media ? "success" : selectedMatch ? "active" : "idle",
      },
    ],
    [
      eventTeams.length,
      eventTeamsLoading,
      matches.length,
      matchesLoading,
      selectedEvent,
      selectedEventId,
      selectedMatch,
    ],
  );

  const handleSelectMatch = (matchId) => {
    const match = matches.find((m) => m.id === matchId) || null;
    setForm(() => {
      const baseForm = createEmptyForm();
      if (!match) {
        return { ...baseForm, matchId };
      }
      return {
        ...baseForm,
        matchId: match.id,
      };
    });
    setResultMessage("");
    setResultError("");
  };

  const handleInput = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleVodChange = (event) => {
    setForm((prev) => ({ ...prev, vodText: event.target.value }));
  };

  const handleClearForm = () => {
    setForm((prev) => ({
      ...createEmptyForm(),
      matchId: prev.matchId,
    }));
    setResultMessage("");
    setResultError("");
  };

  const handlePopulateFromMatch = () => {
    setForm((prev) => syncFormWithMatch(prev, selectedMatch || null));
  };

  const handleSave = async () => {
    setResultError("");
    setResultMessage("");
    if (!form.matchId) {
      setResultError("Select a match to update.");
      return;
    }
    if (!form.url.trim()) {
      setResultError("Enter a media URL before saving.");
      return;
    }
    const payload = buildMediaPayload(form);
    setSaving(true);
    try {
      const updated = await updateMatchMediaLink(form.matchId, payload);
      if (updated) {
        setResultMessage("Media link updated.");
        setMatches((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setForm((prev) => syncFormWithMatch(prev, updated));
      } else {
        setResultError("No changes were saved. Please try again.");
      }
    } catch (err) {
      setResultError(err instanceof Error ? err.message : "Failed to save media link.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearMedia = async () => {
    setResultError("");
    setResultMessage("");
    if (!form.matchId) {
      setResultError("Select a match to clear.");
      return;
    }
    setSaving(true);
    try {
      const cleared = await updateMatchMediaLink(form.matchId, null);
      if (cleared) {
        setResultMessage("Media link removed.");
        setMatches((prev) => prev.map((row) => (row.id === cleared.id ? cleared : row)));
        setForm((prev) => syncFormWithMatch(prev, cleared));
      } else {
        setResultError("No changes were saved. Please try again.");
      }
    } catch (err) {
      setResultError(err instanceof Error ? err.message : "Failed to clear media link.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTeam = eventTeams.find((team) => team.id === selectedTeamId) || null;
  const selectedTeamColors = normalizeStreamingColorAttributes(selectedTeam?.attributes);
  const isEditingSelectedTeam = Boolean(selectedTeam) && editingTeamId === selectedTeam.id;

  const handleSelectTeam = (team) => {
    if (team.id === selectedTeamId) return;
    setSelectedTeamId(team.id);
    // Moving to another team drops any edit in progress.
    if (editingTeamId) {
      setEditingTeamId("");
      setTeamColorForm(createEmptyTeamColorForm());
      setTeamColorError("");
    }
  };

  const handleOpenTeamEditor = (team) => {
    setEditingTeamId(team.id);
    setTeamColorForm(createTeamColorForm(team.attributes));
    setTeamColorError("");
  };

  const handleCancelTeamEditor = () => {
    setEditingTeamId("");
    setTeamColorForm(createEmptyTeamColorForm());
    setTeamColorError("");
  };

  const handleTeamColorInput = (field) => (event) => {
    const value = event.target.value.toUpperCase();
    setTeamColorForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveTeamColors = async (team) => {
    const validationError = validateTeamColorForm(teamColorForm);
    if (validationError) {
      setTeamColorError(validationError);
      return;
    }

    setTeamColorSaving(true);
    setTeamColorError("");
    try {
      // Whatever format was typed, the overlays always get a plain #rrggbb.
      const nextAttributes = mergeTeamColorAttributes(
        team.attributes,
        normalizeTeamColorForm(teamColorForm),
      );
      const updatedTeam = await updateTeamAttributes(team.id, nextAttributes);
      setEventTeams((prev) => prev.map((entry) => (entry.id === updatedTeam.id ? updatedTeam : entry)));
      // Stay on the team, showing what was saved (always HEX).
      setTeamColorForm(createTeamColorForm(updatedTeam.attributes));
    } catch (err) {
      setTeamColorError(err instanceof Error ? err.message : "Unable to save team colors.");
    } finally {
      setTeamColorSaving(false);
    }
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4">
        <Card className="space-y-4 overflow-hidden p-5 sm:p-6">
          <SectionHeader
            eyebrow="Media"
            eyebrowVariant="media"
            title="Match media control"
            action={
              <div className="flex flex-wrap gap-2">
                <Link to="/admin/overlays" className="sc-button">
                  Open overlay system
                </Link>
                <Link to="/admin" className="sc-button is-ghost">
                  Back to admin hub
                </Link>
                <Link to="/tournament-director" className="sc-button is-ghost">
                  Tournament director
                </Link>
              </div>
            }
          />
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {pageStats.map((item) => (
              <div
                key={item.label}
                className={`rounded-2xl border p-3 transition-all ${getStatCardClassName(item.tone)}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
                  {item.label}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-ink sm:text-base">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 py-4">
        <div className="grid gap-4 xl:grid-cols-12">
          <Card
            as="section"
            className={`space-y-4 p-5 xl:col-span-7 transition-all ${
              selectedEventId
                ? "border-media-border bg-media-bg"
                : ""
            }`}
          >
          <SectionHeader
            title="Attach stream to an existing match"
            action={
              <button type="button" onClick={handleClearForm} className="sc-button is-ghost">
                Clear fields
              </button>
            }
          />

          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Event" htmlFor="media-event">
                <Select
                  id="media-event"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  disabled={rolesLoading || roleCatalogLoading || availableEvents.length === 0}
                >
                  <option value="">
                    {rolesLoading || roleCatalogLoading
                      ? "Loading access..."
                      : availableEvents.length === 0
                        ? "No linked events"
                        : "Select event"}
                  </option>
                  {availableEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Match" htmlFor="media-match" hint={matchesLoading ? "Loading matches..." : undefined}>
                <Select
                  id="media-match"
                  value={form.matchId}
                  onChange={(event) => handleSelectMatch(event.target.value)}
                  disabled={!selectedEventId || matchesLoading}
                >
                  <option value="">{matchesLoading ? "Loading matches..." : "Choose a match"}</option>
                  {matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {formatMatchLabel(match)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Media URL" htmlFor="media-url">
              <Input
                id="media-url"
                type="url"
                value={form.url}
                onChange={handleInput("url")}
                placeholder="https://youtu.be/stream-id"
              />
            </Field>
            <Field label="Replay / VOD URLs" htmlFor="media-vod">
              <Textarea id="media-vod" value={form.vodText} onChange={handleVodChange} rows={4} placeholder="One URL per line" />
            </Field>
          </div>

          {(matchesError || eventError) && (
            <div className="space-y-2">
              {eventError && <div className="sc-alert is-error">{eventError}</div>}
              {matchesError && <div className="sc-alert is-error">{matchesError}</div>}
            </div>
          )}

          {!rolesLoading && !roleCatalogLoading && availableEvents.length === 0 && !eventError ? (
            <div className="sc-alert is-error">
              No events are linked to your media access assignments.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleSave} disabled={saving} className="sc-button disabled:cursor-not-allowed">
              {saving ? "Saving..." : "Save media link"}
            </button>
            <button type="button" onClick={handleClearMedia} disabled={saving || !form.matchId} className="sc-button is-ghost text-rose-200">
              Remove media
            </button>
            <button type="button" onClick={handlePopulateFromMatch} disabled={!selectedMatch} className="sc-button is-ghost">
              Load current media
            </button>
          </div>

          {(resultMessage || resultError) && (
            <div className="space-y-2">
              {resultError && <div className="sc-alert is-error">{resultError}</div>}
              {resultMessage && <div className="sc-alert is-success">{resultMessage}</div>}
            </div>
          )}
          </Card>

          <div className="space-y-4 xl:col-span-5">
            <Card as="section" className="space-y-3 p-5 xl:sticky xl:top-4">
              <SectionHeader title="Selected match details" />
              {selectedMatch ? (
                <div className="grid gap-2.5">
                  <div className="space-y-1 rounded-2xl border border-media-border bg-media-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Match</p>
                    <p className="text-sm font-semibold text-ink">{formatMatchLabel(selectedMatch)}</p>
                    <p className="text-xs text-ink-muted">
                      Status: <span className="font-semibold text-ink">{selectedMatch.status}</span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      Has media: <span className="font-semibold text-ink">{selectedMatch.has_media ? "Yes" : "No"}</span>
                    </p>
                  </div>
                  <div
                    className={`space-y-1 border p-3 ${
                      selectedMedia?.url
                        ? "rounded-2xl border-media-border bg-media-bg"
                        : "rounded-2xl border-border/70"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current media snapshot</p>
                    {selectedMedia?.url ? (
                      <>
                        <p className="break-all text-xs text-ink-muted">{selectedMedia.url}</p>
                        {selectedMedia.vod.length ? (
                          <p className="text-xs text-ink-muted">VOD links: {selectedMedia.vod.length}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-ink-muted">No media link stored.</p>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface-muted/30 p-0">
                    <div className="p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Preview payload</p>
                    </div>
                    <pre className="max-h-64 overflow-auto border-t border-border p-3 text-xs text-ink">
                      {JSON.stringify(buildMediaPayload(form), null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Select an event and match to view details.</p>
              )}
            </Card>
          </div>
        </div>

        <Card as="section" className="space-y-3 p-5">
          <SectionHeader
            title="Team color reference"
            description="Primary is the dark variant: usually light text on a dark background. Secondary is the light variant: dark text on a light background. Select a team to see its colours and edit them."
          />
          {eventTeamsError ? <div className="sc-alert is-error">{eventTeamsError}</div> : null}
          {!selectedEventId ? (
            <p className="text-sm text-ink-muted">Select an event to load team attributes.</p>
          ) : eventTeamsLoading ? (
            <p className="text-sm text-ink-muted">Loading event teams...</p>
          ) : eventTeams.length === 0 ? (
            <p className="text-sm text-ink-muted">No teams are linked to this event yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
                {eventTeams.map((team) => {
                  const colorAttributes = normalizeStreamingColorAttributes(team.attributes);
                  const isSelectedTeam = selectedTeamId === team.id;
                  const inMatch = isTeamInSelectedMatch(team.id, selectedMatch);

                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => handleSelectTeam(team)}
                      aria-pressed={isSelectedTeam}
                      className={`grid grid-cols-2 gap-1.5 rounded-2xl border-2 p-1.5 text-left transition ${
                        isSelectedTeam
                          ? "border-[var(--sc-accent)]"
                          : inMatch
                            ? "border-[rgba(255,231,168,0.45)]"
                            : "border-transparent hover:border-border"
                      }`}
                      title={inMatch ? `${team.name} (active match)` : team.name}
                    >
                      <span
                        className="flex min-h-15 items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold"
                        style={{
                          backgroundColor: isHexColor(colorAttributes.primaryColor)
                            ? colorAttributes.primaryColor
                            : "transparent",
                          color: isHexColor(colorAttributes.textOnPrimary)
                            ? colorAttributes.textOnPrimary
                            : "var(--sc-ink)",
                          borderColor: "color-mix(in srgb, var(--sc-border) 70%, transparent)",
                        }}
                      >
                        {team.name}
                      </span>
                      <span
                        className="flex min-h-15 items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold"
                        style={{
                          backgroundColor: isHexColor(colorAttributes.secondaryColor)
                            ? colorAttributes.secondaryColor
                            : "transparent",
                          color: isHexColor(colorAttributes.textOnSecondary)
                            ? colorAttributes.textOnSecondary
                            : "var(--sc-ink)",
                          borderColor: "color-mix(in srgb, var(--sc-border) 70%, transparent)",
                        }}
                      >
                        {team.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedTeam ? (
                <div className="space-y-3 rounded-2xl border border-border/70 bg-surface/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-ink">{selectedTeam.name}</p>
                      {isTeamInSelectedMatch(selectedTeam.id, selectedMatch) ? (
                        <span className="rounded-full border border-[rgba(255,231,168,0.4)] bg-[rgba(255,231,168,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fff1ba]">
                          Active match
                        </span>
                      ) : null}
                    </div>
                    {!isEditingSelectedTeam ? (
                      <button
                        type="button"
                        onClick={() => handleOpenTeamEditor(selectedTeam)}
                        className="sc-button"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>

                  {isEditingSelectedTeam ? (
                    <>
                      <p className="text-sm text-ink-muted">
                        Enter colours as HEX (preferred, the most exact: #1D4ED8), rgb(29, 78, 216),
                        hsl(224, 76%, 48%) or a colour name. Every colour is saved as HEX.
                      </p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {STREAMING_COLOR_FIELDS.map((field) => (
                          <Field key={`${selectedTeam.id}-${field}`} label={field} htmlFor={`${selectedTeam.id}-${field}`}>
                            <Input
                              id={`${selectedTeam.id}-${field}`}
                              type="text"
                              value={teamColorForm[field]}
                              onChange={handleTeamColorInput(field)}
                              placeholder="#000000"
                            />
                          </Field>
                        ))}
                      </div>
                      {teamColorError ? <div className="sc-alert is-error">{teamColorError}</div> : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveTeamColors(selectedTeam)}
                          className="sc-button"
                          disabled={teamColorSaving}
                        >
                          {teamColorSaving ? "Saving..." : "Save colors"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelTeamEditor}
                          className="sc-button is-ghost"
                          disabled={teamColorSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {STREAMING_COLOR_FIELDS.map((field) => {
                        const value = selectedTeamColors[field];
                        return (
                          <div key={field} className="flex items-center gap-2 text-sm">
                            <span
                              className="h-5 w-5 shrink-0 rounded border border-border"
                              style={{ backgroundColor: isHexColor(value) ? value : "transparent" }}
                              aria-hidden="true"
                            />
                            <dt className="text-ink-muted">{field}</dt>
                            <dd className="font-mono text-ink">{value || "not set"}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Select a team to see its colours.</p>
              )}
            </>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}

function formatMatchLabel(match) {
  const teamA = match.team_a?.short_name || match.team_a?.name || "Team A";
  const teamB = match.team_b?.short_name || match.team_b?.name || "Team B";
  const dateLabel = match.start_time ? new Date(match.start_time).toLocaleString() : "TBD";
  return `${teamA} vs ${teamB} — ${dateLabel}`;
}

function createEmptyForm() {
  return {
    matchId: "",
    url: "",
    vodText: "",
  };
}

function syncFormWithMatch(prevForm, match) {
  if (!match) {
    return { ...prevForm, matchId: "" };
  }
  const parsed = parseMediaLink(match);
  return {
    matchId: match.id,
    url: parsed.url,
    vodText: parsed.vod.join("\n"),
  };
}

function parseMediaLink(match) {
  const mediaLink = match?.media_link || null;
  const primary = (mediaLink && mediaLink.primary) || {};
  const vodArray = Array.isArray(mediaLink?.vod) ? mediaLink.vod : [];
  return {
    url: match?.media_url || primary.url || "",
    vod: vodArray
      .map((entry) => {
        if (entry && typeof entry === "object" && typeof entry.url === "string") {
          return entry.url;
        }
        return null;
      })
      .filter(Boolean),
  };
}

function buildMediaPayload(form) {
  const vodEntries = form.vodText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  const payload = {
    primary: {
      url: form.url.trim(),
    },
  };

  if (vodEntries.length) {
    payload.vod = vodEntries.map((url) => ({ url }));
  }

  return payload;
}

function createEmptyTeamColorForm() {
  return {
    accentColor: "",
    primaryColor: "",
    textOnPrimary: "",
    secondaryColor: "",
    textOnSecondary: "",
  };
}

function createTeamColorForm(attributes) {
  return normalizeStreamingColorAttributes(attributes);
}

function normalizeStreamingColorAttributes(attributes) {
  const source = attributes && typeof attributes === "object" ? attributes : {};
  return STREAMING_COLOR_FIELDS.reduce((accumulator, field) => {
    const value = source[field];
    accumulator[field] = typeof value === "string" ? value.trim() : "";
    return accumulator;
  }, {});
}

function isHexColor(value) {
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(String(value || "").trim());
}

/**
 * Turns any CSS colour the browser understands (HEX with or without "#", rgb(),
 * hsl(), a colour name) into "#rrggbb". Returns "" when it is not a colour.
 * Transparency is ignored: the overlays only take opaque colours.
 */
function toHexColor(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (/^(?:[0-9a-fA-F]{3}){1,2}$/.test(text)) text = `#${text}`;
  if (isHexColor(text)) {
    const digits = text.slice(1);
    const full = digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits;
    return `#${full.toUpperCase()}`;
  }
  if (typeof document === "undefined") return "";
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return "";
  // An unknown colour leaves fillStyle unchanged, so try it against two backgrounds.
  context.fillStyle = "#000000";
  context.fillStyle = text;
  const first = context.fillStyle;
  context.fillStyle = "#ffffff";
  context.fillStyle = text;
  if (first !== context.fillStyle) return "";
  if (first.startsWith("#")) return first.toUpperCase();
  const channels = first.match(/[0-9.]+/g);
  if (!channels || channels.length < 3) return "";
  return `#${channels
    .slice(0, 3)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function normalizeTeamColorForm(form) {
  return STREAMING_COLOR_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = toHexColor(form?.[field]);
    return accumulator;
  }, {});
}

function validateTeamColorForm(form) {
  for (const field of STREAMING_COLOR_FIELDS) {
    const value = String(form?.[field] || "").trim();
    if (!value) continue;
    if (!toHexColor(value)) {
      return `${field} is not a valid colour. Use HEX (#1D4ED8), rgb(29, 78, 216), hsl(224, 76%, 48%) or a colour name.`;
    }
  }
  return "";
}

function mergeTeamColorAttributes(existingAttributes, nextColorAttributes) {
  const base =
    existingAttributes && typeof existingAttributes === "object"
      ? { ...existingAttributes }
      : {};

  STREAMING_COLOR_FIELDS.forEach((field) => {
    const value = String(nextColorAttributes?.[field] || "").trim();
    if (value) {
      base[field] = value;
    } else {
      delete base[field];
    }
  });

  return Object.keys(base).length > 0 ? base : null;
}

function getStatCardClassName(tone) {
  switch (tone) {
    case "active":
      return "border-media-border bg-media-bg";
    case "loading":
      return "border-warning-border bg-warning-bg";
    case "success":
      return "border-media-border bg-media-bg";
    default:
      return "border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_60%)]";
  }
}

function isTeamInSelectedMatch(teamId, selectedMatch) {
  if (!teamId || !selectedMatch) return false;
  return (
    String(selectedMatch.team_a?.id || "") === String(teamId) ||
    String(selectedMatch.team_b?.id || "") === String(teamId)
  );
}

const TEAM_COLOR_LABELS = {
  accentColor: "Accent (border)",
  primaryColor: "Primary (dark background)",
  textOnPrimary: "Text on primary",
  secondaryColor: "Secondary (light background)",
  textOnSecondary: "Text on secondary",
};

function TeamColorSwatch({ background, text, label }) {
  const hasBackground = isHexColor(background);
  return (
    <span
      className="flex min-h-[3.25rem] items-center justify-center px-2 py-2 text-center text-sm font-semibold"
      style={{
        backgroundColor: hasBackground ? background : "var(--sc-surface)",
        color: isHexColor(text) ? text : "var(--sc-ink)",
      }}
    >
      <span className="line-clamp-2">{hasBackground ? label : `${label} (not assigned)`}</span>
    </span>
  );
}
