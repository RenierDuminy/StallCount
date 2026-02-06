import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent, updateMatchMediaLink } from "../services/matchService";
import { Card, Panel, SectionHeader, SectionShell, Field, Input, Select, Textarea } from "../components/ui/primitives";

export default function MediaAdminPage() {
  const [events, setEvents] = useState([]);
  const [eventError, setEventError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState("");
  const [form, setForm] = useState(createEmptyForm());
  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [resultError, setResultError] = useState("");

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
    if (!selectedEventId) {
      setMatches([]);
      setForm(createEmptyForm());
      return;
    }
    let ignore = false;
    async function loadMatches() {
      setMatchesLoading(true);
      setMatchesError("");
      try {
        const rows = await getMatchesByEvent(selectedEventId, 200, { includeFinished: true });
        if (!ignore) {
          setMatches(rows ?? []);
          setForm(createEmptyForm());
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
  }, [selectedEventId]);

  const selectedMatch = useMemo(() => {
    return matches.find((match) => match.id === form.matchId) || null;
  }, [form.matchId, matches]);

  const selectedMedia = useMemo(() => {
    return selectedMatch ? parseMediaLink(selectedMatch) : null;
  }, [selectedMatch]);

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

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Admin tools"
            title="Match media control"
            description="Select any scheduled match and attach or edit its stream URL."
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
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6 py-6">
        <Card as="section" className="space-y-5 p-6">
          <SectionHeader
            eyebrow="Update media"
            title="Attach stream to an existing match"
            description="Pick the event and match, then drop in the stream URL."
            action={
              <button type="button" onClick={handleClearForm} className="sc-button is-ghost">
                Clear fields
              </button>
            }
          />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Event" htmlFor="media-event">
              <Select id="media-event" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
                <option value="">Select event</option>
                {events.map((event) => (
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
            <Field label="Media URL" htmlFor="media-url">
              <Input
                id="media-url"
                type="url"
                value={form.url}
                onChange={handleInput("url")}
                placeholder="https://youtu.be/stream-id"
              />
            </Field>
            <Field label="Replay / VOD URLs" className="md:col-span-2 lg:col-span-3" htmlFor="media-vod">
              <Textarea id="media-vod" value={form.vodText} onChange={handleVodChange} rows={3} placeholder="One URL per line" />
            </Field>
          </div>

          {(matchesError || eventError) && (
            <div className="space-y-2">
              {eventError && <div className="sc-alert is-error">{eventError}</div>}
              {matchesError && <div className="sc-alert is-error">{matchesError}</div>}
            </div>
          )}

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

        <Card as="section" className="space-y-4 p-6">
          <SectionHeader title="Selected match details" description="Live snapshot of the currently selected match and payload preview." />
          {selectedMatch ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Panel variant="muted" className="space-y-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Match</p>
                <p className="text-sm font-semibold text-ink">{formatMatchLabel(selectedMatch)}</p>
                <p className="text-xs text-ink-muted">
                  Status: <span className="font-semibold text-ink">{selectedMatch.status}</span>
                </p>
                <p className="text-xs text-ink-muted">
                  Has media: <span className="font-semibold text-ink">{selectedMatch.has_media ? "Yes" : "No"}</span>
                </p>
              </Panel>
              <Panel variant="muted" className="space-y-1 p-4">
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
              </Panel>
              <Panel variant="muted" className="md:col-span-2 p-0">
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Preview payload</p>
                </div>
                <pre className="max-h-64 overflow-auto border-t border-border p-4 text-xs text-ink">
                  {JSON.stringify(buildMediaPayload(form), null, 2)}
                </pre>
              </Panel>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Select an event and match to view details.</p>
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
