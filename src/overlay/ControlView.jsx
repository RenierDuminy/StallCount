import { useMemo, useState, useCallback, useEffect } from "react";
import { Card, Chip, Field, Select, SectionHeader } from "../components/ui/primitives";
import { MatchLogEventCard } from "../pages/scorekeeper/eventCards";
import {
  WeatherCard,
  readCachedWeatherForVenue,
  summarizeWeather,
  getVenueName,
} from "./WeatherCard";
import { MATCH_LOG_EVENT_CODES } from "../services/matchLogService";

function TimedButton({ children, onClick, durationSeconds, disabled, autoFade = true, className = "" }) {
  const [animKey, setAnimKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [latched, setLatched] = useState(false);

  useEffect(() => {
    if (autoFade && latched) setLatched(false);
  }, [autoFade]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (!autoFade) {
      setLatched((prev) => !prev);
      if (!latched) onClick?.();
      return;
    }
    setAnimKey((k) => k + 1);
    setRunning(true);
    onClick?.();
  }, [disabled, autoFade, latched, onClick]);

  const handleAnimationEnd = useCallback(() => {
    setRunning(false);
  }, []);

  const hasDuration = autoFade && Number.isFinite(durationSeconds) && durationSeconds > 0;

  return (
    <button
      type="button"
      className={`sc-timed-btn ${running ? "is-running" : ""} ${latched ? "is-latched" : ""} ${disabled ? "is-disabled" : ""} ${className}`}
      onClick={handleClick}
      disabled={disabled}
    >
      {hasDuration && (
        <span
          key={animKey}
          className={`sc-timed-btn__fill ${running ? "is-animating" : ""}`}
          style={running ? { animationDuration: `${durationSeconds}s` } : undefined}
          onAnimationEnd={handleAnimationEnd}
          aria-hidden="true"
        />
      )}
      <span className="sc-timed-btn__label">{children}</span>
    </button>
  );
}

const BUTTON_DURATION_SECONDS = {
  playerStats: 6,
  matchStats: 8,
  matchStatus: 10,
  teamRosters: 10,
  timeout: 4,
  fieldCall: 4,
  matchEvent: 5,
  breakChance: 4,
};

// Human-readable phase for the match-status card: before / halftime / after.
function describeMatchPhase(status) {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (["finished", "completed", "complete", "final", "ended", "done"].includes(normalized)) {
    return { phase: "after", label: "Full time" };
  }
  if (["halftime", "half_time", "half-time", "ht", "break"].includes(normalized)) {
    return { phase: "ht", label: "Halftime" };
  }
  if (["live", "in_progress", "playing", "running"].includes(normalized)) {
    return { phase: "live", label: "Live" };
  }
  return { phase: "before", label: "Upcoming" };
}
const FIELD_CALL_OPTIONS = ["Pick", "Violation", "Foul", "Injury"];

function formatDate(value) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString();
}

function formatStatValue(value) {
  if (value === null || value === undefined || value === "") return "--";
  return value;
}

// Match start_time is stored UTC; all matches play in CAT (UTC+2).
function formatKickoffCat(value) {
  if (!value) return "--";
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return String(value);
  const shifted = new Date(ms + 2 * 60 * 60 * 1000);
  const date = shifted.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm} CAT`;
}

function isRulesLeaf(value) {
  return value === null || value === undefined || typeof value !== "object";
}

function renderRulesValue(value, keyPrefix = "", depth = 0) {
  if (depth > 10) return <span className="rules-empty">…</span>;

  if (value === null || value === undefined) {
    return <span className="rules-empty">--</span>;
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="rules-empty">Empty list</span>;
    return (
      <ul className="rules-list">
        {value.map((item, index) => (
          <li className="rules-item" key={`${keyPrefix}-${index}`}>
            <span className="rules-key">[{index + 1}]</span>
            <div className="rules-value">{renderRulesValue(item, `${keyPrefix}-${index}`, depth + 1)}</div>
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return <span className="rules-empty">No details</span>;
    return (
      <ul className="rules-list">
        {entries.map(([key, itemValue]) => {
          const leaf = isRulesLeaf(itemValue);
          return (
            <li
              className={`rules-item${leaf ? " rules-item--leaf" : ""}`}
              key={`${keyPrefix}-${key}`}
            >
              <span className="rules-key">{key}</span>
              <div className="rules-value">{renderRulesValue(itemValue, `${keyPrefix}-${key}`, depth + 1)}</div>
            </li>
          );
        })}
      </ul>
    );
  }

  return <span className="rules-leaf">{String(value)}</span>;
}

function renderAutoFadeToggle(checked, onChange) {
  return (
    <label className="overlay-switch">
      <span className="overlay-switch__label">Auto fade</span>
      <span className="overlay-switch__control">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="overlay-switch__slider" aria-hidden="true"></span>
      </span>
    </label>
  );
}

export function ControlView({
  overlayUrl,
  overlayPreviewUrl,
  canPreview,
  copied,
  handleCopy,
  showControl,
  matchDetails,
  eventDetails,
  eventCardLogs,
  isLoadingDetails,
  isLoadingLogs,
  isLoadingRoster,
  detailsError,
  logsError,
  rosterError,
  rosterByTeam,
  bannerPlayerId,
  setBannerPlayerId,
  bannerStatus,
  bannerPlayerOptions,
  selectedBannerPlayer,
  matchStats,
  matchEventButtons,
  matchEventError,
  playerStatsAutoFade,
  setPlayerStatsAutoFade,
  matchStatsAutoFade,
  setMatchStatsAutoFade,
  timeoutAutoFade,
  setTimeoutAutoFade,
  matchEventAutoFade,
  setMatchEventAutoFade,
  fieldCallAutoFade,
  setFieldCallAutoFade,
  teamRostersAutoFade,
  setTeamRostersAutoFade,
  matchStatusAutoFade,
  setMatchStatusAutoFade,
  breakChanceEnabled,
  setBreakChanceEnabled,
  handleTriggerBanner,
  handleTriggerMatchStats,
  handleTriggerMatchStatus,
  handleTriggerTeamRosters,
  handleTriggerTimeout,
  handleTriggerMatchEvent,
  handleTriggerFieldCall,
  handleTriggerBreakChance,
}) {
  const teamARoster = rosterByTeam[matchDetails?.team_a?.id] || [];
  const teamBRoster = rosterByTeam[matchDetails?.team_b?.id] || [];

  const bannerEventGroups = useMemo(() => {
    const scoreOnly = [];
    const stoppage = [];
    let halftimeEvent = null;

    matchEventButtons.forEach((eventType) => {
      const code = (eventType?.code || "").toString().toLowerCase();
      const description = (eventType?.description || "").toString().toLowerCase();
      const combined = `${code} ${description}`.trim();

      if (!halftimeEvent && combined.includes("half")) {
        halftimeEvent = eventType;
      }

      if (combined.includes("stoppage")) {
        stoppage.push(eventType);
        return;
      }

      if (combined.includes("score") || combined.includes("goal") || /cal+ahan/.test(combined)) {
        scoreOnly.push(eventType);
      }
    });

    return { scoreOnly, stoppage, halftimeEvent };
  }, [matchEventButtons]);

  const venue = matchDetails?.venue;
  const matchPhase = describeMatchPhase(matchDetails?.status);
  const statusWeather = useMemo(() => {
    const cached = readCachedWeatherForVenue(venue);
    return cached ? summarizeWeather(cached.weather) : null;
  }, [venue, bannerStatus]);
  const venueLabel = getVenueName(venue) || matchDetails?.event?.location || eventDetails?.location;

  return (
    <>
      <header className="overlay-header overlay-header--minimal overlay-header--compact overlay-header--with-actions">
        <div className="overlay-header__text">
          <h1 className="overlay-header__title overlay-header__title--compact">Control</h1>
        </div>
        <div className="overlay-header__actions">
          <a className="sc-button is-ghost" href="#config">
            Back
          </a>
          <button
            type="button"
            className={`sc-button is-ghost ${overlayUrl ? "" : "is-disabled"}`}
            onClick={handleCopy}
            disabled={!overlayUrl}
          >
            {copied ? "Copied" : "Copy URL"}
          </button>
          <a
            className={`sc-button ${canPreview ? "" : "is-disabled"}`}
            href={canPreview ? overlayPreviewUrl : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!canPreview}
          >
            Open preview
          </a>
        </div>
      </header>

      <section className="overlay-section">
        {showControl ? (
          <div className="overlay-control-layout">
            <div className="overlay-control-stack">
              <Card className="overlay-card overlay-matchstatus-card">
                <SectionHeader
                  title="Match info"
                  description="On-air card with fixture, venue, and weather. Show before, at halftime, or after the match."
                  action={
                    <>
                      {renderAutoFadeToggle(matchStatusAutoFade, setMatchStatusAutoFade)}
                      <TimedButton
                        durationSeconds={BUTTON_DURATION_SECONDS.matchStatus}
                        autoFade={matchStatusAutoFade}
                        onClick={handleTriggerMatchStatus}
                      >
                        Show match info
                      </TimedButton>
                    </>
                  }
                  divider
                />

                <div className="overlay-matchstatus-preview">
                  <div className="overlay-matchstatus-preview__phase">
                    <span className={`overlay-matchstatus-badge is-${matchPhase.phase}`}>
                      {matchPhase.label}
                    </span>
                    <span className="overlay-matchstatus-score">
                      {formatStatValue(matchStats?.scoreA)} – {formatStatValue(matchStats?.scoreB)}
                    </span>
                  </div>

                  <div className="overlay-matchstatus-teams">
                    {matchDetails?.team_a?.name || "Team A"}
                    <span className="overlay-matchstatus-vs"> vs </span>
                    {matchDetails?.team_b?.name || "Team B"}
                  </div>

                  <dl className="overlay-matchstatus-meta">
                    <div>
                      <dt>Kickoff</dt>
                      <dd>{formatKickoffCat(matchDetails?.start_time)}</dd>
                    </div>
                    <div>
                      <dt>Venue</dt>
                      <dd>{venueLabel || "--"}</dd>
                    </div>
                    <div>
                      <dt>Event</dt>
                      <dd>{eventDetails?.name || matchDetails?.event?.name || "--"}</dd>
                    </div>
                    <div>
                      <dt>Weather</dt>
                      <dd>
                        {statusWeather ? (
                          <>
                            {statusWeather.icon}{" "}
                            {statusWeather.feelsLike != null
                              ? `${statusWeather.feelsLike}${statusWeather.tempUnit} feels like`
                              : statusWeather.temp != null
                                ? `${statusWeather.temp}${statusWeather.tempUnit}`
                                : ""}{" "}
                            {statusWeather.condition}
                            {statusWeather.wind != null
                              ? ` · ${statusWeather.wind} ${statusWeather.windUnit} wind`.trimEnd()
                              : ""}
                          </>
                        ) : (
                          "No weather loaded — refresh the weather card first."
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </Card>

              <Card className="overlay-card overlay-banner-card">
                <SectionHeader
                  title="Banners"
                  description="Trigger on-air banners that slide behind the score bar."
                  divider
                />

                <div className="overlay-banner-grid">
                  <WeatherCard
                    venue={matchDetails?.venue}
                    startTime={matchDetails?.start_time}
                    matchStatus={matchDetails?.status}
                    eventStatus={matchDetails?.event?.Status ?? eventDetails?.Status}
                  />

                  <div className="overlay-banner-block">
                    <div className="overlay-banner-block__header">
                      <div className="overlay-banner-block__title">Player stats</div>
                      {renderAutoFadeToggle(playerStatsAutoFade, setPlayerStatsAutoFade)}
                    </div>
                    <Field
                    >
                      <Select
                        value={bannerPlayerId}
                        onChange={(event) => setBannerPlayerId(event.target.value)}
                        className="player-select"
                      >
                        <option value="">Select player</option>
                        {bannerPlayerOptions.teamA.length > 0 && (
                          <optgroup label={matchDetails?.team_a?.name || "Team A"}>
                            {bannerPlayerOptions.teamA.map((player) => (
                              <option key={player.id} value={player.id}>
                                {Number.isFinite(player.number) ? `#${player.number} ` : ""}{player.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {bannerPlayerOptions.teamB.length > 0 && (
                          <optgroup label={matchDetails?.team_b?.name || "Team B"}>
                            {bannerPlayerOptions.teamB.map((player) => (
                              <option key={player.id} value={player.id}>
                                {Number.isFinite(player.number) ? `#${player.number} ` : ""}{player.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </Select>
                    </Field>
                    <TimedButton
                      durationSeconds={BUTTON_DURATION_SECONDS.playerStats}
                      autoFade={playerStatsAutoFade}
                      onClick={handleTriggerBanner}
                      disabled={!selectedBannerPlayer}
                    >
                      Show player stats
                    </TimedButton>
                  </div>

                  <div className="overlay-banner-block">
                    <div className="overlay-banner-block__header">
                      <div className="overlay-banner-block__title">Match stats</div>
                      {renderAutoFadeToggle(matchStatsAutoFade, setMatchStatsAutoFade)}
                    </div>
                    <div className="overlay-matchstats-table">
                      <table className="overlay-matchstats-table__grid">
                        <thead>
                          <tr>
                            <th>{matchDetails?.team_a?.name || "Team A"}</th>
                            <th></th>
                            <th>{matchDetails?.team_b?.name || "Team B"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{formatStatValue(matchStats?.scoreA)}</td>
                            <td>Score</td>
                            <td>{formatStatValue(matchStats?.scoreB)}</td>
                          </tr>
                          <tr>
                            <td>{formatStatValue(matchStats?.holdsA)}</td>
                            <td>Holds</td>
                            <td>{formatStatValue(matchStats?.holdsB)}</td>
                          </tr>
                          <tr>
                            <td>{formatStatValue(matchStats?.breaksA)}</td>
                            <td>Breaks</td>
                            <td>{formatStatValue(matchStats?.breaksB)}</td>
                          </tr>
                          <tr>
                            <td>{formatStatValue(matchStats?.turnoversA)}</td>
                            <td>Turnovers</td>
                            <td>{formatStatValue(matchStats?.turnoversB)}</td>
                          </tr>
                          <tr>
                            <td>{formatStatValue(matchStats?.blocksA)}</td>
                            <td>Blocks</td>
                            <td>{formatStatValue(matchStats?.blocksB)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <TimedButton
                      durationSeconds={BUTTON_DURATION_SECONDS.matchStats}
                      autoFade={matchStatsAutoFade}
                      onClick={handleTriggerMatchStats}
                    >
                      Show match stats
                    </TimedButton>
                  </div>

                  <div className="overlay-banner-block">
                    <div className="overlay-banner-block__header">
                      <div className="overlay-banner-block__title">Timeouts</div>
                      {renderAutoFadeToggle(timeoutAutoFade, setTimeoutAutoFade)}
                    </div>
                    <div className="overlay-banner-actions">
                      <TimedButton
                        durationSeconds={BUTTON_DURATION_SECONDS.timeout}
                        autoFade={timeoutAutoFade}
                        onClick={() => handleTriggerTimeout("A")}
                      >
                        {matchDetails?.team_a?.name || "Team A"}
                      </TimedButton>
                      <TimedButton
                        durationSeconds={BUTTON_DURATION_SECONDS.timeout}
                        autoFade={timeoutAutoFade}
                        onClick={() => handleTriggerTimeout("B")}
                      >
                        {matchDetails?.team_b?.name || "Team B"}
                      </TimedButton>
                    </div>
                  </div>

                  <div className="overlay-banner-block">
                    <div className="overlay-banner-block__header">
                      <div className="overlay-banner-block__title">Events</div>
                      {renderAutoFadeToggle(matchEventAutoFade, setMatchEventAutoFade)}
                    </div>
                    <div className="overlay-banner-actions">
                      <TimedButton
                        durationSeconds={BUTTON_DURATION_SECONDS.matchEvent}
                        autoFade={matchEventAutoFade}
                        disabled={!bannerEventGroups.halftimeEvent}
                        onClick={() => handleTriggerMatchEvent(bannerEventGroups.halftimeEvent)}
                      >
                        Halftime
                      </TimedButton>
                      <TimedButton
                        durationSeconds={BUTTON_DURATION_SECONDS.matchEvent}
                        autoFade={matchEventAutoFade}
                        disabled={!bannerEventGroups.stoppage.length}
                        onClick={() => handleTriggerMatchEvent(bannerEventGroups.stoppage[0])}
                      >
                        Stoppage
                      </TimedButton>
                    </div>
                    {matchEventError ? (
                      <p className="overlay-banner-status overlay-banner-status--error">{matchEventError}</p>
                    ) : null}
                  </div>

                  <div className="overlay-banner-block">
                    <div className="overlay-banner-block__header">
                      <div className="overlay-banner-block__title">Field calls</div>
                      {renderAutoFadeToggle(fieldCallAutoFade, setFieldCallAutoFade)}
                    </div>
                    <div className="overlay-banner-actions overlay-banner-actions--four">
                      {FIELD_CALL_OPTIONS.map((callLabel) => (
                        <TimedButton
                          key={callLabel}
                          durationSeconds={BUTTON_DURATION_SECONDS.fieldCall}
                          autoFade={fieldCallAutoFade}
                          onClick={() => handleTriggerFieldCall(callLabel)}
                        >
                          {callLabel}
                        </TimedButton>
                      ))}
                    </div>
                  </div>

                  <div className="overlay-banner-block">
                    <div className="overlay-banner-block__title">Break chance</div>
                    <div className="overlay-banner-block__header">
                      <label className="overlay-switch">
                        <span className="overlay-switch__label">Enabled</span>
                        <span className="overlay-switch__control">
                          <input
                            type="checkbox"
                            checked={breakChanceEnabled}
                            onChange={(event) => setBreakChanceEnabled(event.target.checked)}
                          />
                          <span className="overlay-switch__slider" aria-hidden="true"></span>
                        </span>
                      </label>
                      <TimedButton
                        durationSeconds={BUTTON_DURATION_SECONDS.breakChance}
                        autoFade
                        disabled={!breakChanceEnabled}
                        onClick={handleTriggerBreakChance}
                        className="is-narrow"
                      >
                        Test BC
                      </TimedButton>
                    </div>
                  </div>

                  {bannerStatus ? (
                    <p className="overlay-banner-status">{bannerStatus}</p>
                  ) : null}
                </div>
              </Card>

              <Card className="overlay-card overlay-roster-card">
                <SectionHeader
                  title="Team rosters"
                  action={
                    <>
                      {renderAutoFadeToggle(teamRostersAutoFade, setTeamRostersAutoFade)}
                      <TimedButton durationSeconds={BUTTON_DURATION_SECONDS.teamRosters} autoFade={teamRostersAutoFade} onClick={handleTriggerTeamRosters}>
                        Show rosters
                      </TimedButton>
                    </>
                  }
                  divider
                />

                {isLoadingRoster ? (
                  <p className="overlay-data-state">Loading team roster...</p>
                ) : rosterError ? (
                  <p className="overlay-data-state overlay-data-state--error">{rosterError}</p>
                ) : teamARoster.length || teamBRoster.length ? (
                  <div className="overlay-roster-stack">
                    <div className="overlay-roster-grid">
                      <div>
                        <div className="overlay-roster-title">{matchDetails?.team_a?.name || "Team A"} ({teamARoster.length} rostered)</div>
                        <ul className="overlay-roster-list">
                          {teamARoster.length ? (
                            teamARoster.map((player, index) => (
                              <li className="overlay-roster-item" key={`team-a-${index}`}>
                                <span className="overlay-roster-identity">
                                  {player.isCaptain ? (
                                    <span className="overlay-roster-tag overlay-roster-tag--captain" aria-label="Captain">
                                      C
                                    </span>
                                  ) : null}
                                  {player.isSpiritCaptain ? (
                                    <span
                                      className="overlay-roster-tag overlay-roster-tag--spirit"
                                      aria-label="Spirit captain"
                                    >
                                      SC
                                    </span>
                                  ) : null}
                                  <span className="overlay-roster-number">
                                    {(player.number != null && Number.isFinite(Number(player.number))) ? player.number : ""}
                                  </span>
                                  <span className="overlay-roster-name">{player.name}</span>
                                </span>
                              </li>
                            ))
                          ) : (
                            <li className="overlay-roster-empty">No players loaded.</li>
                          )}
                        </ul>
                      </div>
                      <div>
                        <div className="overlay-roster-title">{matchDetails?.team_b?.name || "Team B"} ({teamBRoster.length} rostered)</div>
                        <ul className="overlay-roster-list">
                          {teamBRoster.length ? (
                            teamBRoster.map((player, index) => (
                              <li className="overlay-roster-item" key={`team-b-${index}`}>
                                <span className="overlay-roster-identity">
                                  {player.isCaptain ? (
                                    <span className="overlay-roster-tag overlay-roster-tag--captain" aria-label="Captain">
                                      C
                                    </span>
                                  ) : null}
                                  {player.isSpiritCaptain ? (
                                    <span
                                      className="overlay-roster-tag overlay-roster-tag--spirit"
                                      aria-label="Spirit captain"
                                    >
                                      SC
                                    </span>
                                  ) : null}
                                  <span className="overlay-roster-number">
                                    {(player.number != null && Number.isFinite(Number(player.number))) ? player.number : ""}
                                  </span>
                                  <span className="overlay-roster-name">{player.name}</span>
                                </span>
                              </li>
                            ))
                          ) : (
                            <li className="overlay-roster-empty">No players loaded.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="overlay-data-state">No roster data available.</p>
                )}
              </Card>

              <Card className="overlay-card overlay-rules-card">
                <SectionHeader
                  title="Rules"
                  description="Event details and rules."
                  divider
                />

                {isLoadingDetails ? (
                  <p className="overlay-data-state">Loading event details...</p>
                ) : detailsError ? (
                  <p className="overlay-data-state overlay-data-state--error">{detailsError}</p>
                ) : eventDetails ? (
                  <div className="overlay-data-body">
                    <dl className="overlay-definition-list">
                      <div className="overlay-definition-item">
                        <dt>Event ID</dt>
                        <dd>{eventDetails.id}</dd>
                      </div>
                      <div className="overlay-definition-item">
                        <dt>Name</dt>
                        <dd>{eventDetails.name || "--"}</dd>
                      </div>
                      <div className="overlay-definition-item">
                        <dt>Type</dt>
                        <dd>{eventDetails.type || "--"}</dd>
                      </div>
                      <div className="overlay-definition-item">
                        <dt>Status</dt>
                        <dd>{eventDetails.Status || "--"}</dd>
                      </div>
                      <div className="overlay-definition-item">
                        <dt>Start date</dt>
                        <dd>{formatDate(eventDetails.start_date)}</dd>
                      </div>
                      <div className="overlay-definition-item">
                        <dt>End date</dt>
                        <dd>{formatDate(eventDetails.end_date)}</dd>
                      </div>
                      <div className="overlay-definition-item">
                        <dt>Location</dt>
                        <dd>{eventDetails.location || "--"}</dd>
                      </div>
                    </dl>

                    <div className="overlay-rules">
                      <div className="overlay-rules-header">Rules</div>
                      <div className="overlay-rules-body">
                        {eventDetails.rules ? (
                          (() => {
                            try {
                              return renderRulesValue(eventDetails.rules, "rules");
                            } catch {
                              return <span className="rules-empty">Unable to display rules.</span>;
                            }
                          })()
                        ) : (
                          <span className="rules-empty">No rules provided</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="overlay-data-state">No event data available.</p>
                )}
              </Card>
            </div>

            <Card className="overlay-card overlay-log-card">
              <SectionHeader
                title="Match log"
                description="Realtime feed of match events."
                divider
              />

              {isLoadingLogs ? (
                <p className="overlay-data-state">Loading match logs...</p>
              ) : logsError ? (
                <p className="overlay-data-state overlay-data-state--error">{logsError}</p>
              ) : eventCardLogs.length ? (
                <div className="overlay-log-list">
                  {eventCardLogs.map((log) => (
                    <MatchLogEventCard
                      key={log.id}
                      log={log}
                      isBreak={log.isBreak}
                      chronologicalIndex={log.scoreOrderIndex}
                      displayTeamA={matchDetails?.team_a?.name || "Team A"}
                      displayTeamB={matchDetails?.team_b?.name || "Team B"}
                      displayTeamAShort={matchDetails?.team_a?.name || "Team A"}
                      displayTeamBShort={matchDetails?.team_b?.name || "Team B"}
                      readOnly
                    />
                  ))}
                </div>
              ) : (
                <p className="overlay-data-state">No match logs yet.</p>
              )}
            </Card>
          </div>
        ) : (
          <Card className="overlay-card overlay-control-locked">
            <p className="overlay-data-state">
              Initialize the configuration to unlock overlay controls, rules, and match logs.
            </p>
          </Card>
        )}
      </section>
    </>
  );
}
