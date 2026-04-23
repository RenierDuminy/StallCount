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
      const nextAttributes = mergeTeamColorAttributes(team.attributes, teamColorForm);
      const updatedTeam = await updateTeamAttributes(team.id, nextAttributes);
      setEventTeams((prev) => prev.map((entry) => (entry.id === updatedTeam.id ? updatedTeam : entry)));
      setEditingTeamId("");
      setTeamColorForm(createEmptyTeamColorForm());
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
            title="Match media control"
            action={
              <div className="flex flex-wrap gap-2">
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
                ? "border-[rgba(121,184,255,0.28)] bg-[linear-gradient(180deg,rgba(121,184,255,0.08),transparent_32%)]"
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
                  <div className="space-y-1 rounded-2xl border border-[rgba(121,184,255,0.3)] bg-[linear-gradient(180deg,rgba(121,184,255,0.08),transparent_55%)] p-3">
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
                        ? "rounded-2xl border-[rgba(79,209,161,0.28)] bg-[linear-gradient(180deg,rgba(79,209,161,0.08),transparent_55%)]"
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
          />
          {eventTeamsError ? <div className="sc-alert is-error">{eventTeamsError}</div> : null}
          {!selectedEventId ? (
            <p className="text-sm text-ink-muted">Select an event to load team attributes.</p>
          ) : eventTeamsLoading ? (
            <p className="text-sm text-ink-muted">Loading event teams...</p>
          ) : eventTeams.length === 0 ? (
            <p className="text-sm text-ink-muted">No teams are linked to this event yet.</p>
          ) : (
            <div className="grid gap-3 2xl:grid-cols-2">
              {eventTeams.map((team) => {
                const colorAttributes = normalizeStreamingColorAttributes(team.attributes);
                const hasColorValues = STREAMING_COLOR_FIELDS.some((field) => Boolean(colorAttributes[field]));
                const isEditingTeam = editingTeamId === team.id;

                return (
                  <div
                    key={team.id}
                    className={`grid gap-3 border-[2px] p-3 transition-all lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.15fr)] lg:items-center ${
                      isTeamInSelectedMatch(team.id, selectedMatch)
                        ? "rounded-3xl border-[rgba(255,231,168,0.45)] bg-[linear-gradient(180deg,rgba(255,231,168,0.1),transparent_50%)] shadow-[0_0_0_1px_rgba(255,231,168,0.08)]"
                        : "rounded-3xl bg-surface-muted/20"
                    }`}
                    style={
                      isHexColor(colorAttributes.accentColor)
                        ? { borderColor: colorAttributes.accentColor }
                        : undefined
                    }
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{team.name}</p>
                        {isTeamInSelectedMatch(team.id, selectedMatch) ? (
                          <span className="rounded-full border border-[rgba(255,231,168,0.4)] bg-[rgba(255,231,168,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fff1ba]">
                            Active match
                          </span>
                        ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenTeamEditor(team)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-surface/70 text-ink-muted transition hover:border-border hover:text-ink"
                          aria-label={`Edit ${team.name} colors`}
                          title={`Edit ${team.name} colors`}
                          disabled={teamColorSaving && isEditingTeam}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10-10a2.12 2.12 0 0 0-3-3L5 17v3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5l4 4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {hasColorValues ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div
                          className="flex min-h-[3.75rem] items-center rounded-xl border px-3 py-2"
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
                          <div className="w-full">
                            <p className="text-center text-sm font-semibold">
                              {team.name} (dark)
                            </p>
                          </div>
                        </div>
                        <div
                          className="flex min-h-[3.75rem] items-center rounded-xl border px-3 py-2"
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
                          <div className="w-full">
                            <p className="text-center text-sm font-semibold">
                              {team.name} (light)
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-ink-muted">No streaming color attributes found for this team.</p>
                    )}
                    {isEditingTeam ? (
                      <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-surface/60 p-3">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {STREAMING_COLOR_FIELDS.map((field) => (
                            <Field key={`${team.id}-${field}`} label={field} htmlFor={`${team.id}-${field}`}>
                              <Input
                                id={`${team.id}-${field}`}
                                type="text"
                                value={teamColorForm[field]}
                                onChange={handleTeamColorInput(field)}
                                placeholder="#000000"
                                maxLength={7}
                              />
                            </Field>
                          ))}
                        </div>
                        {teamColorError ? (
                          <div className="mt-3 sc-alert is-error">{teamColorError}</div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveTeamColors(team)}
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
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
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

function validateTeamColorForm(form) {
  for (const field of STREAMING_COLOR_FIELDS) {
    const value = String(form?.[field] || "").trim();
    if (!value) continue;
    if (!isHexColor(value)) {
      return `${field} must be a valid HEX color.`;
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
      return "border-[rgba(121,184,255,0.34)] bg-[radial-gradient(circle_at_top_left,rgba(121,184,255,0.16),transparent_60%)]";
    case "loading":
      return "border-[rgba(255,231,168,0.34)] bg-[radial-gradient(circle_at_top_left,rgba(255,231,168,0.14),transparent_60%)]";
    case "success":
      return "border-[rgba(79,209,161,0.34)] bg-[radial-gradient(circle_at_top_left,rgba(79,209,161,0.16),transparent_60%)]";
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
