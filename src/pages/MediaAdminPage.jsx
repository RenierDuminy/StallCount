import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getEventsList } from "../services/leagueService";
import { getMatchesByEvent, updateMatchMediaLink } from "../services/matchService";

const MEDIA_STATUS_OPTIONS = ["scheduled", "ready", "pending", "live", "halftime", "finished", "completed", "canceled"];
const MEDIA_PROVIDER_PRESETS = ["youtube", "twitch", "ultiworld", "fan_seat", "custom"];

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
        defaultStartTime: match.start_time ? toDateTimeLocal(match.start_time) : "",
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
      defaultStartTime: prev.defaultStartTime,
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
      setResultMessage("Media link updated.");
      if (updated) {
        setMatches((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setForm((prev) => syncFormWithMatch(prev, updated));
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
      setResultMessage("Media link removed.");
      if (cleared) {
        setMatches((prev) => prev.map((row) => (row.id === cleared.id ? cleared : row)));
        setForm((prev) => syncFormWithMatch(prev, cleared));
      }
    } catch (err) {
      setResultError(err instanceof Error ? err.message : "Failed to clear media link.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-16 text-[var(--sc-ink)]">
      <header className="sc-shell py-6">
        <div className="sc-card-base space-y-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sc-chip">Admin tools</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Media</span>
          </div>
          <h1 className="text-3xl font-semibold">Match media control</h1>
          <p className="text-sm text-[var(--sc-ink-muted)]">
            Select any scheduled match and attach or edit its streaming metadata. The database normalizer will tidy the payload automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin" className="sc-button is-ghost">
              Back to admin hub
            </Link>
            <Link to="/tournament-director" className="sc-button is-outline">
              Tournament director
            </Link>
          </div>
        </div>
      </header>

      <main className="sc-shell space-y-6 py-6">
        <section className="sc-card-base space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Update media</p>
              <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Attach stream to an existing match</h2>
              <p className="text-xs text-[var(--sc-ink-muted)]">
                Pick the event and match, confirm the existing status, then drop in the stream details. Fields mirror the quick-create widget from the Tournament Director.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearForm}
              className="rounded border border-[var(--sc-border)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)] hover:border-[var(--sc-ink-muted)]"
            >
              Clear fields
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Event
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm focus:border-[var(--sc-border-strong)] focus:outline-none"
              >
                <option value="">Select event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Match
              <select
                value={form.matchId}
                onChange={(event) => handleSelectMatch(event.target.value)}
                disabled={!selectedEventId || matchesLoading}
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm focus:border-[var(--sc-border-strong)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{matchesLoading ? "Loading matches..." : "Choose a match"}</option>
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {formatMatchLabel(match)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Provider
              <select
                value={form.provider}
                onChange={handleInput("provider")}
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm capitalize focus:border-[var(--sc-border-strong)] focus:outline-none"
              >
                <option value="">Use auto-detect</option>
                {MEDIA_PROVIDER_PRESETS.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Media URL
              <input
                type="url"
                value={form.url}
                onChange={handleInput("url")}
                placeholder="https://youtu.be/stream-id"
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm focus:border-[var(--sc-border-strong)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Embed URL (optional)
              <input
                type="url"
                value={form.embedUrl}
                onChange={handleInput("embedUrl")}
                placeholder="https://www.youtube.com/embed/..."
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm focus:border-[var(--sc-border-strong)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Media status
              <select
                value={form.mediaStatus}
                onChange={handleInput("mediaStatus")}
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm capitalize focus:border-[var(--sc-border-strong)] focus:outline-none"
              >
                <option value="">Mirror match status ({selectedMatch?.status || "N/A"})</option>
                {MEDIA_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Stream start time
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={handleInput("startTime")}
                className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm focus:border-[var(--sc-border-strong)] focus:outline-none"
              />
              {form.defaultStartTime && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, startTime: prev.defaultStartTime }))}
                  className="text-xs font-semibold text-[var(--sc-ink-muted)] underline decoration-dotted decoration-[var(--sc-ink-muted)] underline-offset-4"
                >
                  Use match start
                </button>
              )}
            </label>
            <label className="md:col-span-2 lg:col-span-3 flex flex-col gap-1 text-sm font-semibold text-[var(--sc-ink)]">
              Replay / VOD URLs
              <textarea
                value={form.vodText}
                onChange={handleVodChange}
                rows={3}
                placeholder="One URL per line"
                className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-3 py-2 text-sm focus:border-[var(--sc-border-strong)] focus:outline-none"
              />
            </label>
          </div>

          {(matchesError || eventError) && (
            <div className="space-y-2">
              {eventError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{eventError}</p>
              )}
              {matchesError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{matchesError}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--sc-accent)] to-[var(--sc-accent-strong)] px-5 py-2.5 text-sm font-semibold text-[#03140f] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(198,255,98,0.5)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save media link"}
            </button>
            <button
              type="button"
              onClick={handleClearMedia}
              disabled={saving || !form.matchId}
              className="inline-flex items-center justify-center rounded-full border border-rose-400/70 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20 hover:text-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove media
            </button>
            <button
              type="button"
              onClick={handlePopulateFromMatch}
              disabled={!selectedMatch}
              className="inline-flex items-center justify-center rounded-full border border-[var(--sc-border-strong)]/70 bg-[var(--sc-surface)] px-4 py-2 text-sm font-semibold text-[var(--sc-ink)] transition hover:border-[var(--sc-accent)]/50 hover:text-[var(--sc-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Load current media
            </button>
          </div>

          {(resultMessage || resultError) && (
            <div className="space-y-2">
              {resultError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{resultError}</p>
              )}
              {resultMessage && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{resultMessage}</p>
              )}
            </div>
          )}
        </section>

        <section className="sc-card-base space-y-4 p-6">
          <h3 className="text-lg font-semibold text-[var(--sc-ink)]">Selected match details</h3>
          {selectedMatch ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-4 py-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Match</p>
                <p className="text-sm font-semibold text-[var(--sc-ink)]">{formatMatchLabel(selectedMatch)}</p>
                <p className="text-xs text-[var(--sc-ink-muted)]">
                  Status: <span className="font-semibold text-[var(--sc-ink)]">{selectedMatch.status}</span>
                </p>
                <p className="text-xs text-[var(--sc-ink-muted)]">
                  Has media: <span className="font-semibold text-[var(--sc-ink)]">{selectedMatch.has_media ? "Yes" : "No"}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] px-4 py-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Current media snapshot</p>
                {selectedMatch.media_url ? (
                  <>
                    <p className="text-sm font-semibold text-[var(--sc-ink)]">{selectedMatch.media_provider || "custom"}</p>
                    <p className="text-xs text-[var(--sc-ink-muted)] break-all">{selectedMatch.media_url}</p>
                    {selectedMatch.media_status && (
                      <p className="text-xs text-[var(--sc-ink-muted)]">Status: {selectedMatch.media_status}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--sc-ink-muted)]">No media link stored.</p>
                )}
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Preview payload</p>
                <pre className="mt-2 max-h-64 overflow-auto rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-muted)] p-4 text-xs text-[var(--sc-ink)]">
                  {JSON.stringify(buildMediaPayload(form), null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--sc-ink-muted)]">Select an event and match to view details.</p>
          )}
        </section>
      </main>
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
    provider: "",
    url: "",
    embedUrl: "",
    mediaStatus: "",
    startTime: "",
    defaultStartTime: "",
    vodText: "",
  };
}

function syncFormWithMatch(prevForm, match) {
  if (!match) {
    return { ...prevForm, matchId: "", defaultStartTime: "" };
  }
  const parsed = parseMediaLink(match);
  const defaultStart = match.start_time ? toDateTimeLocal(match.start_time) : "";
  return {
    matchId: match.id,
    provider: parsed.provider,
    url: parsed.url,
    embedUrl: parsed.embedUrl,
    mediaStatus: parsed.status,
    startTime: parsed.startTime || defaultStart,
    defaultStartTime: defaultStart,
    vodText: parsed.vod.join("\n"),
  };
}

function parseMediaLink(match) {
  const mediaLink = match?.media_link || null;
  const primary = (mediaLink && mediaLink.primary) || {};
  const vodArray = Array.isArray(mediaLink?.vod) ? mediaLink.vod : [];
  return {
    provider: match?.media_provider || primary.provider || "",
    url: match?.media_url || primary.url || "",
    embedUrl: primary.embed_url || "",
    status: match?.media_status || primary.status || "",
    startTime: primary.start_time ? toDateTimeLocal(primary.start_time) : "",
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
  const provider = form.provider || undefined;
  const status = form.mediaStatus || undefined;
  const trimmedEmbedUrl = (form.embedUrl || "").trim();
  const embedUrl = trimmedEmbedUrl ? trimmedEmbedUrl : undefined;
  const startTimeIso = form.startTime ? new Date(form.startTime).toISOString() : undefined;
  const vodEntries = form.vodText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  const payload = {
    primary: {
      provider: provider || "custom",
      url: form.url.trim(),
    },
  };

  if (status) {
    payload.primary.status = status;
  }
  if (embedUrl) {
    payload.primary.embed_url = embedUrl;
  }
  if (startTimeIso) {
    payload.primary.start_time = startTimeIso;
  }
  if (vodEntries.length) {
    payload.vod = vodEntries.map((url) => ({ url }));
  }

  return payload;
}

function toDateTimeLocal(value) {
  try {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
