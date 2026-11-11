import { useMemo, useState } from "react";
import { Field, Input, Select, Textarea } from "../components/ui/primitives";
import { MATCH_LOG_EVENT_CODES } from "../services/matchLogService";
import {
  TEST_MATCH_STATUS_OPTIONS,
  createDefaultTestMatch,
  parseTestRoster,
  appendTestLog,
  removeTestLog,
  removeLastTestLog,
  advanceTestMatchTime,
  resetTestMatchLog,
  getTestMatchFlags,
} from "./overlayTestMatch";

const CODES = MATCH_LOG_EVENT_CODES;

const LOG_LABELS = {
  [CODES.SCORE]: "Score",
  [CODES.CALAHAN]: "Callahan",
  [CODES.MATCH_START]: "Match start",
  [CODES.MATCH_END]: "Match end",
  [CODES.TURNOVER]: "Turnover",
  [CODES.BLOCK]: "Block",
  [CODES.TIMEOUT_START]: "Timeout",
  [CODES.TIMEOUT_END]: "Timeout end",
  [CODES.HALFTIME_START]: "Halftime start",
  [CODES.HALFTIME_END]: "Halftime end",
  [CODES.STOPPAGE_START]: "Stoppage start",
  [CODES.STOPPAGE_END]: "Stoppage end",
};

const COLOUR_FIELDS = [
  { key: "primaryColor", label: "Primary" },
  { key: "textOnPrimary", label: "Text on primary" },
  { key: "secondaryColor", label: "Secondary" },
  { key: "textOnSecondary", label: "Text on secondary" },
];

const ADVANCE_MINUTES = [1, 5, 15];

const pad = (value) => String(value).padStart(2, "0");

function toLocalInputValue(iso) {
  const parsed = iso ? new Date(iso) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

// A colour input only takes #rrggbb; copied team colours may be #rgb. The stored
// value is left as it is until the colour is changed.
function toColourInputValue(value) {
  const text = `${value ?? ""}`.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : "#000000";
}

function fromLocalInputValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatLogTime(iso, matchStartMs) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "--";
  if (Number.isFinite(matchStartMs) && ms >= matchStartMs) {
    const elapsed = Math.floor((ms - matchStartMs) / 1000);
    return `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;
  }
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Match, rules, venue and both teams. Everything stays editable while the
// overlay is live, so changes can be watched landing on air.
export function TestMatchEditor({ testMatch, setTestMatch }) {
  const set = (key) => (event) => {
    const { value } = event.target;
    setTestMatch((current) => ({ ...current, [key]: value }));
  };
  const setTeam = (slot, key) => (event) => {
    const { value } = event.target;
    setTestMatch((current) => ({
      ...current,
      teams: { ...current.teams, [slot]: { ...current.teams[slot], [key]: value } },
    }));
  };

  return (
    <>
      <div className="config-fieldgroup">
        <div className="test-match-heading">
          <h2 className="config-fieldgroup__title">Test match</h2>
          <button
            type="button"
            className="sc-button is-ghost"
            onClick={() => {
              if (window.confirm("Reset the test match to its defaults? Its log is cleared too.")) {
                setTestMatch((current) => createDefaultTestMatch(current.id));
              }
            }}
          >
            Reset to defaults
          </button>
        </div>
        <p className="overlay-option-note">
          A made-up fixture for building and checking overlays. It lives only in this browser and on the
          overlay channel; nothing is written to the database.
        </p>

        <div className="test-match-grid">
          <Field label="Event name">
            <Input value={testMatch.eventName} onChange={set("eventName")} />
          </Field>
          <Field label="Event location">
            <Input value={testMatch.eventLocation} onChange={set("eventLocation")} />
          </Field>
          <Field label="Venue">
            <Input value={testMatch.venueName} onChange={set("venueName")} placeholder="Leave empty for no venue" />
          </Field>
          <Field label="Match start">
            <Input
              type="datetime-local"
              value={toLocalInputValue(testMatch.startTime)}
              onChange={(event) => {
                const startTime = fromLocalInputValue(event.target.value);
                setTestMatch((current) => ({ ...current, startTime }));
              }}
            />
          </Field>
          <Field label="Venue latitude" hint="Optional, for the weather card.">
            <Input inputMode="decimal" value={testMatch.venueLatitude} onChange={set("venueLatitude")} placeholder="-33.92" />
          </Field>
          <Field label="Venue longitude">
            <Input inputMode="decimal" value={testMatch.venueLongitude} onChange={set("venueLongitude")} placeholder="18.42" />
          </Field>
          <Field label="Status">
            <Select value={testMatch.status} onChange={set("status")}>
              {/* A copied match can carry a status the list doesn't offer. */}
              {TEST_MATCH_STATUS_OPTIONS.some((option) => option.value === testMatch.status) ? null : (
                <option value={testMatch.status}>{testMatch.status}</option>
              )}
              {TEST_MATCH_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pulls first">
            <Select value={testMatch.pullingTeam} onChange={set("pullingTeam")}>
              <option value="A">{testMatch.teams.A.name || "Team A"}</option>
              <option value="B">{testMatch.teams.B.name || "Team B"}</option>
              <option value="">Not set</option>
            </Select>
          </Field>
          <Field label={`Score: ${testMatch.teams.A.name || "Team A"}`}>
            <Input type="number" min={0} value={testMatch.scoreA} onChange={set("scoreA")} />
          </Field>
          <Field label={`Score: ${testMatch.teams.B.name || "Team B"}`}>
            <Input type="number" min={0} value={testMatch.scoreB} onChange={set("scoreB")} />
          </Field>
          <Field label="Time cap (minutes)" hint="Empty = no match clock.">
            <Input type="number" min={0} value={testMatch.timeCapMinutes} onChange={set("timeCapMinutes")} />
          </Field>
          <Field label="Inter-point (seconds)">
            <Input type="number" min={0} value={testMatch.interPointSeconds} onChange={set("interPointSeconds")} />
          </Field>
          <Field label="ABBA starts with">
            <Select value={testMatch.abbaPattern} onChange={set("abbaPattern")}>
              <option value="none">No ABBA</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </Field>
        </div>
      </div>

      <div className="config-fieldgroup">
        <h2 className="config-fieldgroup__title">Test teams</h2>
        <div className="overlay-team-toggle-grid">
          {["A", "B"].map((slot) => {
            const team = testMatch.teams[slot];
            return (
              <div className="test-match-team" key={slot}>
                <Field label={`Team ${slot} name`}>
                  <Input value={team.name} onChange={setTeam(slot, "name")} />
                </Field>
                <Field label="Short name">
                  <Input value={team.shortName} onChange={setTeam(slot, "shortName")} maxLength={6} />
                </Field>
                <div className="test-match-colours">
                  {COLOUR_FIELDS.map(({ key, label }) => (
                    <label className="test-match-colour" key={key}>
                      <input type="color" value={toColourInputValue(team[key])} onChange={setTeam(slot, key)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <Field label="Roster" hint='One player per line: "7 Alex Moreno". Add (C) or (SC) for captains.'>
                  <Textarea rows={8} value={team.rosterText} onChange={setTeam(slot, "rosterText")} />
                </Field>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Writes the match log the way the scorekeeper console would, so every
// log-driven part of the overlay (clock, timeouts, halftime, stoppage, break
// chance, add-ons) can be exercised.
export function TestMatchSimulator({ testMatch, setTestMatch, compact = false }) {
  const [picks, setPicks] = useState({ A: { actor: "", assist: "" }, B: { actor: "", assist: "" } });
  const rosters = useMemo(
    () => ({
      A: parseTestRoster(testMatch.teams.A.rosterText, "A"),
      B: parseTestRoster(testMatch.teams.B.rosterText, "B"),
    }),
    [testMatch.teams.A.rosterText, testMatch.teams.B.rosterText],
  );
  const playerNames = useMemo(() => {
    const names = {};
    [...rosters.A, ...rosters.B].forEach((player) => {
      names[player.id] = player.name;
    });
    return names;
  }, [rosters]);
  const flags = getTestMatchFlags(testMatch);

  const sortedLogs = useMemo(
    () => [...testMatch.logs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [testMatch.logs],
  );
  const matchStartMs = useMemo(() => {
    const start = sortedLogs.find((log) => log.code === CODES.MATCH_START);
    return start ? new Date(start.createdAt).getTime() : null;
  }, [sortedLogs]);

  const log = (code, team = null, { actorId = null, secondaryActorId = null } = {}) => {
    setTestMatch((current) => appendTestLog(current, { code, team, actorId, secondaryActorId }));
  };
  const setPick = (slot, key) => (event) => {
    const { value } = event.target;
    setPicks((current) => ({ ...current, [slot]: { ...current[slot], [key]: value } }));
  };
  const teamName = (slot) => testMatch.teams[slot]?.name || `Team ${slot}`;

  return (
    <div className={compact ? "test-match-sim test-match-sim--compact" : "config-fieldgroup test-match-sim"}>
      {compact ? null : <h2 className="config-fieldgroup__title">Simulate match events</h2>}

      <div className="test-match-actions">
        <button type="button" className="sc-button" onClick={() => log(CODES.MATCH_START)}>
          Start match
        </button>
        <button
          type="button"
          className="sc-button"
          onClick={() => log(flags.halftime ? CODES.HALFTIME_END : CODES.HALFTIME_START)}
        >
          {flags.halftime ? "End halftime" : "Start halftime"}
        </button>
        <button
          type="button"
          className="sc-button"
          onClick={() => log(flags.stoppage ? CODES.STOPPAGE_END : CODES.STOPPAGE_START)}
        >
          {flags.stoppage ? "End stoppage" : "Start stoppage"}
        </button>
        <button
          type="button"
          className="sc-button"
          disabled={!flags.timeoutTeam}
          onClick={() => log(CODES.TIMEOUT_END, flags.timeoutTeam)}
        >
          End timeout
        </button>
        <button type="button" className="sc-button" onClick={() => log(CODES.MATCH_END)}>
          End match
        </button>
      </div>

      <div className="overlay-team-toggle-grid">
        {["A", "B"].map((slot) => {
          const pick = picks[slot];
          const roster = rosters[slot];
          return (
            <div className="test-match-team" key={slot}>
              <div className="test-match-team__title">{teamName(slot)}</div>
              <div className="test-match-picks">
                <Select value={pick.actor} onChange={setPick(slot, "actor")} aria-label={`${teamName(slot)} player`}>
                  <option value="">Player (none)</option>
                  {roster.map((player) => (
                    <option key={player.id} value={player.id}>
                      {Number.isFinite(player.number) ? `#${player.number} ` : ""}
                      {player.name}
                    </option>
                  ))}
                </Select>
                <Select value={pick.assist} onChange={setPick(slot, "assist")} aria-label={`${teamName(slot)} assist`}>
                  <option value="">Assist (none)</option>
                  {roster.map((player) => (
                    <option key={player.id} value={player.id}>
                      {Number.isFinite(player.number) ? `#${player.number} ` : ""}
                      {player.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="test-match-actions">
                <button
                  type="button"
                  className="sc-button"
                  onClick={() => log(CODES.SCORE, slot, { actorId: pick.actor, secondaryActorId: pick.assist })}
                >
                  Score
                </button>
                <button type="button" className="sc-button is-ghost" onClick={() => log(CODES.CALAHAN, slot, { actorId: pick.actor })}>
                  Callahan
                </button>
                <button
                  type="button"
                  className="sc-button is-ghost"
                  title="This team threw it away"
                  onClick={() => log(CODES.TURNOVER, slot, { actorId: pick.actor })}
                >
                  Turnover
                </button>
                <button
                  type="button"
                  className="sc-button is-ghost"
                  title="This team got the D"
                  onClick={() => log(CODES.BLOCK, slot, { actorId: pick.actor })}
                >
                  Block
                </button>
                <button type="button" className="sc-button is-ghost" onClick={() => log(CODES.TIMEOUT_START, slot)}>
                  Timeout
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="test-match-actions test-match-actions--split">
        <div className="test-match-actions">
          <span className="test-match-actions__label">Advance time</span>
          {ADVANCE_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="sc-button is-ghost"
              disabled={!testMatch.logs.length}
              onClick={() => setTestMatch((current) => advanceTestMatchTime(current, minutes))}
            >
              +{minutes} min
            </button>
          ))}
        </div>
        <div className="test-match-actions">
          <button
            type="button"
            className="sc-button is-ghost"
            disabled={!testMatch.logs.length}
            onClick={() => setTestMatch((current) => removeLastTestLog(current))}
          >
            Undo last
          </button>
          <button
            type="button"
            className="sc-button is-ghost"
            disabled={!testMatch.logs.length}
            onClick={() => {
              if (window.confirm("Clear the whole test log and reset the score?")) {
                setTestMatch((current) => resetTestMatchLog(current));
              }
            }}
          >
            Clear log
          </button>
        </div>
      </div>
      <p className="overlay-option-note">
        Advance time moves every row back, which to the overlay looks like that much time passing: the match
        clock runs down and the current point gets longer.
      </p>

      {sortedLogs.length ? (
        <ol className="test-match-log">
          {[...sortedLogs].reverse().map((entry) => {
            const names = [entry.actorId, entry.secondaryActorId].map((id) => (id ? playerNames[id] || "Unknown player" : ""));
            return (
              <li className="test-match-log__row" key={entry.id}>
                <span className="test-match-log__time">{formatLogTime(entry.createdAt, matchStartMs)}</span>
                <span className="test-match-log__event">
                  {LOG_LABELS[entry.code] || entry.code}
                  {entry.team ? ` · ${teamName(entry.team)}` : ""}
                  {names[0] ? ` · ${names[0]}` : ""}
                  {names[1] ? ` (ast ${names[1]})` : ""}
                  {entry.abbaLine ? ` · ${entry.abbaLine}` : ""}
                </span>
                <button
                  type="button"
                  className="test-match-log__remove"
                  aria-label="Delete this row"
                  onClick={() => setTestMatch((current) => removeTestLog(current, entry.id))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="overlay-option-note">No rows yet. Start the match to begin the clock.</p>
      )}
    </div>
  );
}
