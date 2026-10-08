import { useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "../components/ui/primitives";

const OVERLAY_OPTIONS = [
  { value: "overlays/badge-centre.html", label: "Badge centre", hasTeamLogos: true },
  { value: "overlays/compact-bar.html", label: "Compact bar", hasTeamLogos: true },
  { value: "overlays/corner-box-bottom-left.html", label: "Corner box (Bottom-L)", hasTeamLogos: true },
  { value: "overlays/corner-box.html", label: "Corner box (Top-L)", hasTeamLogos: true },
  { value: "overlays/ctfda.html", label: "CTFDA overlay", hasEventLogo: true },
  { value: "overlays/top-right-list.html", label: "Top-right list" },
  { value: "overlays/wfdf-competitive.html", label: "WFDF competitive", hasEventLogo: true },
  { value: "overlays/wide-bar.html", label: "Wide bar", hasTeamLogos: true },
  { value: "overlay-debug.html", label: "Debug", hasEventLogo: true },
];


const LOGO_MAX_DIMENSION = 512;
// The event logo is also sent to overlays over realtime, which caps message size.
const EVENT_LOGO_MAX_DIMENSION = 256;

// Renders the overlay at its native 1920x1080 and scales the whole frame down
// to the stage width, so the preview is a true miniature of the live output.
function ScaledOverlayFrame({ src }) {
  const hostRef = useRef(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setScale(host.clientWidth / 1920);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="preview-scaler">
      <iframe
        title="Overlay preview"
        className="preview-frame preview-frame--scaled"
        src={src}
        width={1920}
        height={1080}
        style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      />
    </div>
  );
}

function readRawDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Logos are stored in localStorage (~5 MB per origin, shared by all logos),
// so downscale large images to keep the data URL small enough to save.
async function readFileAsDataUrl(file, maxDimension = LOGO_MAX_DIMENSION) {
  const raw = await readRawDataUrl(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = raw;
    });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) return raw;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    // Both keep transparency; use whichever encodes smaller.
    const candidates = [raw, canvas.toDataURL("image/png"), canvas.toDataURL("image/webp", 0.92)]
      .filter((url) => url.startsWith("data:image/"));
    return candidates.reduce((best, url) => (url.length < best.length ? url : best));
  } catch {
    return raw;
  }
}

function formatDateTime(value) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatMatchOptionLabel(match) {
  const teamAName = match.team_a?.name || "Team A";
  const teamBName = match.team_b?.name || "Team B";
  const parsed = match.start_time ? new Date(match.start_time) : null;
  const hasTime = parsed && !Number.isNaN(parsed.getTime());
  const date = hasTime ? parsed.toLocaleDateString() : "--";
  const time = hasTime ? parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
  return `${date} - ${time} - ${teamAName} vs ${teamBName}`;
}

export function ConfigView({
  overlayChoice,
  setOverlayChoice,
  matchId,
  setMatchId,
  selectedEventId,
  setSelectedEventId,
  activeEvents,
  isLoadingEvents,
  eventsError,
  eventMatches,
  isLoadingEventMatches,
  eventMatchesError,
  teamATheme,
  setTeamATheme,
  teamBTheme,
  setTeamBTheme,
  teamAPalette,
  teamBPalette,
  matchDetails,
  eventDetails,
  isLoadingDetails,
  detailsError,
  trimmedMatchId,
  hasMatchId,
  configLocked,
  canInitialize,
  canPreview,
  showControl,
  overlayPreviewUrl,
  handleInitialize,
  handleUnlock,
  teamALogo,
  setTeamALogo,
  teamBLogo,
  setTeamBLogo,
  eventLogo,
  setEventLogo,
}) {
  const overlayOption = OVERLAY_OPTIONS.find((o) => o.value === overlayChoice);
  const showTeamLogos = Boolean(overlayOption?.hasTeamLogos);
  const showEventLogo = Boolean(overlayOption?.hasEventLogo);

  return (
    <>
      <header className="overlay-header overlay-header--minimal overlay-header--with-actions">
        <div className="overlay-header__text">
          <h1 className="overlay-header__title">Setup</h1>
        </div>
        <div className="overlay-header__actions">
          {configLocked ? (
            <button type="button" className="sc-button is-ghost" onClick={handleUnlock}>
              Unlock
            </button>
          ) : (
            <button
              type="button"
              className={`sc-button ${canInitialize ? "" : "is-disabled"}`}
              onClick={handleInitialize}
              disabled={!canInitialize}
            >
              Lock &amp; go live
            </button>
          )}
          <a
            className={`sc-button ${showControl ? "" : "is-disabled"}`}
            href={showControl ? "#control" : undefined}
            aria-disabled={!showControl}
          >
            Control →
          </a>
        </div>
      </header>

      <section className="overlay-section">
        <div className="config-grid">

          {/* Left column: form */}
          <div className="config-form-col">
            <div className="config-fieldgroup">
              <h2 className="config-fieldgroup__title">Match selection</h2>

            <Field label="Overlay">
              <Select
                value={overlayChoice}
                onChange={(event) => setOverlayChoice(event.target.value)}
                disabled={configLocked}
              >
                {OVERLAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Event">
              <Select
                value={selectedEventId}
                onChange={(event) => {
                  setSelectedEventId(event.target.value);
                  setMatchId("");
                }}
                disabled={configLocked}
              >
                <option value="">
                  {isLoadingEvents ? "Loading events…" : "Select an event"}
                </option>
                {activeEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
              {eventsError ? (
                <p className="overlay-data-state overlay-data-state--error">{eventsError}</p>
              ) : null}
            </Field>

            <Field label="Match" action={hasMatchId ? "✓" : null}>
              <Select
                value={matchId}
                onChange={(event) => setMatchId(event.target.value)}
                disabled={configLocked || !selectedEventId}
              >
                <option value="">
                  {!selectedEventId
                    ? "Select an event first"
                    : isLoadingEventMatches
                      ? "Loading matches…"
                      : eventMatches.length
                        ? "Select a match"
                        : "No active matches"}
                </option>
                {eventMatches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {formatMatchOptionLabel(match)}
                  </option>
                ))}
              </Select>
              {eventMatchesError ? (
                <p className="overlay-data-state overlay-data-state--error">{eventMatchesError}</p>
              ) : null}

              <div className="config-field-or">or paste a match ID</div>
              <Input
                value={matchId}
                onChange={(event) => setMatchId(event.target.value)}
                placeholder="e.g. 5e2b7c94"
                disabled={configLocked}
              />
              {trimmedMatchId ? (
                isLoadingDetails ? (
                  <p className="overlay-option-note">Loading…</p>
                ) : detailsError ? (
                  <p className="overlay-data-state overlay-data-state--error">{detailsError}</p>
                ) : matchDetails ? (
                  <div className="overlay-match-summary">
                    <div className="overlay-match-summary__title">
                      {matchDetails.team_a?.name || "Team A"} vs {matchDetails.team_b?.name || "Team B"}
                    </div>
                    <div className="overlay-match-summary__meta">
                      <span>{formatDateTime(matchDetails.start_time)}</span>
                      {(matchDetails.event?.location || eventDetails?.location) ? (
                        <span>{matchDetails.event?.location || eventDetails?.location}</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="overlay-option-note">No match found.</p>
                )
              ) : null}
            </Field>
            </div>

            <div className="config-fieldgroup">
              <h2 className="config-fieldgroup__title">Branding &amp; appearance</h2>

            <Field label="Tournament logo">
              <Input
                type="file"
                accept="image/*"
                disabled={configLocked}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const dataUrl = await readFileAsDataUrl(file, EVENT_LOGO_MAX_DIMENSION);
                  setEventLogo(dataUrl);
                }}
              />
              {eventLogo ? (
                <div className="overlay-logo-preview">
                  <img src={eventLogo} alt="Tournament logo" />
                  <button type="button" className="sc-button is-ghost" disabled={configLocked} onClick={() => setEventLogo("")}>
                    Remove
                  </button>
                </div>
              ) : (
                <p className="overlay-option-note">Using default StallCount logo</p>
              )}
              {!showEventLogo ? (
                <p className="overlay-option-note">
                  The current overlay style doesn’t display a tournament logo, but it’s saved and will be used if you switch to a style that does.
                </p>
              ) : null}
            </Field>

            <Field label="Team colours">
              <div className="overlay-team-toggle-grid">
                <div className="overlay-team-toggle">
                  <span className="overlay-team-toggle__label">
                    {matchDetails?.team_a?.name || "Team A"}
                  </span>
                  <Select
                    value={teamATheme}
                    onChange={(event) => setTeamATheme(event.target.value)}
                    disabled={configLocked}
                  >
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                  </Select>
                  <div
                    className="overlay-team-preview"
                    style={{ backgroundColor: teamAPalette.bg, color: teamAPalette.text }}
                  >
                    <span className="overlay-team-preview__name">
                      {matchDetails?.team_a?.name || "Team A"}
                    </span>
                    <span className="overlay-team-preview__meta">{teamAPalette.bg}</span>
                  </div>
                </div>

                <div className="overlay-team-toggle">
                  <span className="overlay-team-toggle__label">
                    {matchDetails?.team_b?.name || "Team B"}
                  </span>
                  <Select
                    value={teamBTheme}
                    onChange={(event) => setTeamBTheme(event.target.value)}
                    disabled={configLocked}
                  >
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                  </Select>
                  <div
                    className="overlay-team-preview"
                    style={{ backgroundColor: teamBPalette.bg, color: teamBPalette.text }}
                  >
                    <span className="overlay-team-preview__name">
                      {matchDetails?.team_b?.name || "Team B"}
                    </span>
                    <span className="overlay-team-preview__meta">{teamBPalette.bg}</span>
                  </div>
                </div>
              </div>
            </Field>

            {showTeamLogos ? (
              <Field label="Team logos">
                <div className="overlay-team-toggle-grid">
                  <div className="overlay-team-toggle">
                    <span className="overlay-team-toggle__label">
                      {matchDetails?.team_a?.name || "Team A"}
                    </span>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={configLocked}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await readFileAsDataUrl(file);
                        setTeamALogo(dataUrl);
                      }}
                    />
                    {teamALogo ? (
                      <div className="overlay-logo-preview">
                        <img src={teamALogo} alt="Team A logo" />
                        <button type="button" className="sc-button is-ghost" disabled={configLocked} onClick={() => setTeamALogo("")}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="overlay-team-toggle">
                    <span className="overlay-team-toggle__label">
                      {matchDetails?.team_b?.name || "Team B"}
                    </span>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={configLocked}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await readFileAsDataUrl(file);
                        setTeamBLogo(dataUrl);
                      }}
                    />
                    {teamBLogo ? (
                      <div className="overlay-logo-preview">
                        <img src={teamBLogo} alt="Team B logo" />
                        <button type="button" className="sc-button is-ghost" disabled={configLocked} onClick={() => setTeamBLogo("")}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Field>
            ) : null}
            </div>
          </div>

          {/* Right column: preview */}
          <div className="config-preview-col">
            <div className="preview-stage" aria-live="polite">
              <img
                className="preview-stage__image"
                src="/overlay-demo.jpg"
                alt=""
                loading="lazy"
              />
              {canPreview ? (
                <ScaledOverlayFrame src={overlayPreviewUrl} />
              ) : (
                <div className="preview-placeholder">
                  <p className="preview-placeholder__title">
                    {hasMatchId ? "Initializing…" : "Enter a match ID"}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>
    </>
  );
}
