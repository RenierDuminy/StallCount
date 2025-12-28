import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { registerScoreboardDevice } from "../services/scoreboardAdminService";

const SUBSCRIPTION_TYPES = [
  { value: "match", label: "Match" },
  { value: "venue", label: "Venue" },
];

const STATUS_OPTIONS = ["scheduled", "live", "halftime", "universe", "final"];
const POSSESSION_OPTIONS = [
  { value: "teamA", label: "Team A" },
  { value: "teamB", label: "Team B" },
];

const INITIAL_REGISTRATION = {
  deviceLabel: "",
  hardwareId: "",
  operator: "",
  notes: "",
  registeredAt: "",
};

const REGISTRATION_FIELDS = [
  { label: "Device label", field: "deviceLabel" },
  { label: "Hardware ID", field: "hardwareId" },
  { label: "Operator", field: "operator" },
];

const INITIAL_SUBSCRIPTION_FORM = {
  type: SUBSCRIPTION_TYPES[0].value,
  target: "",
};

const INITIAL_SCOREBOARD = {
  matchName: "",
  eventName: "",
  venueName: "",
  status: STATUS_OPTIONS[0],
  clock: "12:00",
  teamA: "Team A",
  teamB: "Team B",
  scoreA: 0,
  scoreB: 0,
  possession: POSSESSION_OPTIONS[0].value,
  highlight: "",
  lastUpdate: "",
};

const INITIAL_LOG_FORM = {
  team: POSSESSION_OPTIONS[0].value,
  detail: "",
};

const SAMPLE_EVENTS = ["StallCount Classic", "Metro League Finals", "Rising Tide Cup", "Winter Jam"];
const SAMPLE_VENUES = ["Field 1", "South Dome", "North Arena", "Harbor Pitch"];
const SAMPLE_TEAMS = ["Aurora Flyers", "Metro Orbit", "Skyline Surge", "Cascade Comets", "Neon Owls"];
const SAMPLE_OPERATORS = ["Court Ops", "TD Desk", "Volunteer Crew", "Broadcast Unit"];
const SAMPLE_METADATA = [
  { key: "role", value: "Field board" },
  { key: "power", value: "Battery cart" },
  { key: "network", value: "ESP32 WiFi" },
  { key: "location", value: "Sideline" },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function createMetadataRow(key = "", value = "") {
  return { id: makeId(), key, value };
}

function makeUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.random() * 16;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return Math.floor(value).toString(16);
  });
}

function isUuid(value) {
  if (!value) return false;
  return UUID_REGEX.test(value.trim());
}

function rowsToMetadata(rows) {
  return rows.reduce((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value?.trim() ?? "";
    return acc;
  }, {});
}

function buildSampleData() {
  const teamA = randomItem(SAMPLE_TEAMS);
  let teamB = randomItem(SAMPLE_TEAMS);
  while (teamB === teamA) teamB = randomItem(SAMPLE_TEAMS);
  const now = new Date();
  const sampleMatchId = makeUuid();
  const sampleVenueId = makeUuid();
  const registration = {
    deviceLabel: "Stallmatic MkII",
    hardwareId: `SCB-${Math.floor(Math.random() * 900 + 100)}`,
    operator: randomItem(SAMPLE_OPERATORS),
    notes: "Sample entry generated for diagnostics.",
    registeredAt: now.toISOString(),
  };
  const firstMeta = randomItem(SAMPLE_METADATA);
  const metadataEntries = [
    createMetadataRow(firstMeta.key, firstMeta.value),
    createMetadataRow("venue_hint", randomItem(SAMPLE_VENUES)),
    createMetadataRow("match_hint", sampleMatchId),
  ];
  const subscriptions = [
    { id: makeId(), type: "match", target: sampleMatchId, createdAt: now.toISOString() },
    { id: makeId(), type: "venue", target: sampleVenueId, createdAt: now.toISOString() },
  ];
  const scoreboard = {
    matchName: `${teamA.split(" ")[0]} vs ${teamB.split(" ")[0]}`,
    eventName: randomItem(SAMPLE_EVENTS),
    venueName: randomItem(SAMPLE_VENUES),
    status: "live",
    clock: "07:32",
    teamA,
    teamB,
    scoreA: 11,
    scoreB: 9,
    possession: Math.random() > 0.5 ? "teamA" : "teamB",
    highlight: "Universe point in effect",
    lastUpdate: "Timeout called by Team B",
  };
  const logEntries = [
    { id: makeId(), timestamp: now.toISOString(), team: "teamA", detail: "Goal by Morgan (assist River)" },
    { id: makeId(), timestamp: new Date(now.getTime() - 120 * 1000).toISOString(), team: "teamB", detail: "Layout block by Drew" },
  ];
  return { registration, metadataEntries, subscriptions, scoreboard, logEntries };
}

export default function AdminScoreboardDebugPage() {
  const [registration, setRegistration] = useState(INITIAL_REGISTRATION);
  const [metadataRows, setMetadataRows] = useState(() => [createMetadataRow()]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionForm, setSubscriptionForm] = useState(INITIAL_SUBSCRIPTION_FORM);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [scoreboard, setScoreboard] = useState(INITIAL_SCOREBOARD);
  const [logEntries, setLogEntries] = useState([]);
  const [logForm, setLogForm] = useState(INITIAL_LOG_FORM);
  const [persisting, setPersisting] = useState(false);
  const [persistResult, setPersistResult] = useState({ status: "idle", message: "" });

  const metadataObject = useMemo(() => rowsToMetadata(metadataRows), [metadataRows]);
  const registrationPreview = useMemo(
    () => ({ ...registration, metadata: metadataObject }),
    [registration, metadataObject],
  );
  const rawPayload = useMemo(
    () => ({ registration: registrationPreview, subscriptions, scoreboard, logEntries }),
    [registrationPreview, subscriptions, scoreboard, logEntries],
  );

  const handleRegistrationChange = (field) => (event) => {
    setRegistration((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleMetadataChange = (id, field) => (event) => {
    const value = event.target.value;
    setMetadataRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleAddMetadataRow = () => {
    setMetadataRows((prev) => [...prev, createMetadataRow()]);
  };

  const handleRemoveMetadataRow = (id) => {
    setMetadataRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length > 0 ? next : [createMetadataRow()];
    });
  };

  const handleSubscriptionChange = (field) => (event) => {
    if (subscriptionError) {
      setSubscriptionError("");
    }
    setSubscriptionForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAddSubscription = () => {
    const target = subscriptionForm.target.trim();
    if (!target) {
      setSubscriptionError("Target ID is required.");
      return;
    }
    if (!isUuid(target)) {
      setSubscriptionError("Target IDs must be valid UUIDs.");
      return;
    }
    setSubscriptions((prev) => [
      ...prev,
      {
        id: makeId(),
        type: subscriptionForm.type,
        target,
        createdAt: new Date().toISOString(),
      },
    ]);
    setSubscriptionError("");
    setSubscriptionForm((prev) => ({ ...prev, target: "" }));
  };

  const handleRemoveSubscription = (id) => {
    setSubscriptions((prev) => prev.filter((sub) => sub.id !== id));
  };

  const handleScoreboardChange = (field) => (event) => {
    const value = event.target.value;
    setScoreboard((prev) => ({
      ...prev,
      [field]: field === "scoreA" || field === "scoreB" ? Math.max(0, Number(value) || 0) : value,
    }));
  };

  const adjustScore = (team, delta) => {
    const key = team === "teamB" ? "scoreB" : "scoreA";
    setScoreboard((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const handleLogChange = (field) => (event) => {
    setLogForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAddLogEntry = () => {
    if (!logForm.detail.trim()) return;
    const detail = logForm.detail.trim();
    const entry = { id: makeId(), timestamp: new Date().toISOString(), team: logForm.team, detail };
    setLogEntries((prev) => [entry, ...prev]);
    setScoreboard((prev) => ({ ...prev, lastUpdate: detail }));
    setLogForm((prev) => ({ ...prev, detail: "" }));
  };

  const handlePersistDevice = async () => {
    const timestamp = registration.registeredAt || new Date().toISOString();
    if (!registration.registeredAt) {
      setRegistration((prev) => ({ ...prev, registeredAt: timestamp }));
    }
    const normalizedRegistration = {
      ...registration,
      registeredAt: timestamp,
      metadata: metadataObject,
    };
    setPersistResult({ status: "idle", message: "" });
    setPersisting(true);
    try {
      const deviceId = await registerScoreboardDevice({
        registration: normalizedRegistration,
        subscriptions,
      });
      setPersistResult({
        status: "success",
        message: deviceId ? `Device registered (id: ${deviceId})` : "Device registered.",
      });
    } catch (err) {
      setPersistResult({
        status: "error",
        message: err instanceof Error ? err.message : "Unable to register device.",
      });
    } finally {
      setPersisting(false);
    }
  };

  const handlePopulateSample = () => {
    const sample = buildSampleData();
    setRegistration(sample.registration);
    setMetadataRows(sample.metadataEntries ?? [createMetadataRow()]);
    setSubscriptions(sample.subscriptions);
    setScoreboard(sample.scoreboard);
    setLogEntries(sample.logEntries);
    setSubscriptionForm(INITIAL_SUBSCRIPTION_FORM);
    setLogForm(INITIAL_LOG_FORM);
    setSubscriptionError("");
  };

  const handleResetAll = () => {
    setRegistration(INITIAL_REGISTRATION);
    setMetadataRows([createMetadataRow()]);
    setSubscriptions([]);
    setScoreboard(INITIAL_SCOREBOARD);
    setLogEntries([]);
    setSubscriptionForm(INITIAL_SUBSCRIPTION_FORM);
    setLogForm(INITIAL_LOG_FORM);
    setPersistResult({ status: "idle", message: "" });
    setSubscriptionError("");
  };

  const handleStampNow = () => {
    const now = new Date().toISOString();
    setRegistration((prev) => ({ ...prev, registeredAt: now }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 px-4 py-8 text-white">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-300">Admin tools</p>
        <h1 className="mt-2 text-3xl font-semibold">Scoreboard sandbox</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Configure mock devices, simulate updates, and inspect the JSON payload that would be dispatched to a scoreboard client. Nothing leaves this page.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Back to admin hub
          </Link>
          <Link
            to="/tournament-director"
            className="inline-flex items-center rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Tournament director
          </Link>
        </div>
      </header>

      <main className="space-y-10 px-4 py-10 sm:px-8 lg:px-16">
        <section className="rounded-3xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Device registration</p>
              <h2 className="text-2xl font-semibold text-slate-900">Enrollment profile</h2>
              <p className="text-sm text-slate-500">
                Capture the device metadata and operational notes. Subscriptions live in their own workflow below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePopulateSample}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Load sample data
              </button>
              <button
                type="button"
                onClick={handleStampNow}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Stamp now
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={handlePersistDevice}
                disabled={persisting || !registration.deviceLabel.trim() || !registration.hardwareId.trim()}
                className="rounded-full border border-emerald-500/60 px-4 py-2 text-sm font-semibold text-emerald-700 transition disabled:opacity-50 disabled:text-emerald-400 disabled:border-emerald-200 enabled:hover:bg-emerald-500/10"
              >
                {persisting ? "Saving..." : "Register device"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {REGISTRATION_FIELDS.map((item) => (
              <label key={item.field} className="text-sm font-medium text-slate-700">
                {item.label}
                <input
                  type="text"
                  value={registration[item.field]}
                  onChange={handleRegistrationChange(item.field)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
            ))}
            <div className="md:col-span-3 rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Metadata tags</p>
                  <p className="text-xs text-slate-500">
                    Key/value hints shipped with the device record (e.g. mount, network notes, venue id).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddMetadataRow}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Add tag
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {metadataRows.map((row) => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      type="text"
                      value={row.key}
                      onChange={handleMetadataChange(row.id, "key")}
                      placeholder="Key (e.g. mount)"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={handleMetadataChange(row.id, "value")}
                      placeholder="Value"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMetadataRow(row.id)}
                      className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <label className="md:col-span-3 text-sm font-medium text-slate-700">
              Notes
              <textarea
                rows={3}
                value={registration.notes}
                onChange={handleRegistrationChange("notes")}
                className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none"
              />
            </label>
            {persistResult.status !== "idle" ? (
              <div
                className={`md:col-span-3 rounded-2xl border px-4 py-3 text-sm ${
                  persistResult.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
                }`}
              >
                {persistResult.message}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Subscriptions</p>
              <h2 className="text-2xl font-semibold text-slate-900">Follow targets</h2>
              <p className="text-sm text-slate-500">
                Attach matches or venues to the enrolled device so it knows which feeds to consume.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">{subscriptions.length} active</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-end">
            <label className="text-sm font-medium text-slate-600">
              Type
              <select
                value={subscriptionForm.type}
                onChange={handleSubscriptionChange("type")}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {SUBSCRIPTION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-sm font-medium text-slate-600">
              Target ID
              <input
                type="text"
                value={subscriptionForm.target}
                onChange={handleSubscriptionChange("target")}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="e.g. 2b17f6d2-..."
              />
            </label>
            <button
              type="button"
              onClick={handleAddSubscription}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add target
            </button>
          </div>
          {subscriptionError ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
              {subscriptionError}
            </div>
          ) : null}

          <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50">
            {subscriptions.length === 0 ? (
              <li className="p-4 text-sm text-slate-500">No subscriptions yet.</li>
            ) : (
              subscriptions.map((sub) => (
                <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {sub.type} — {sub.target}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(sub.createdAt).toLocaleTimeString()}</p>
                  </div>
                  <button type="button" onClick={() => handleRemoveSubscription(sub.id)} className="text-rose-600 hover:text-rose-500">
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-3xl bg-slate-900 p-6 text-white shadow">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-300">Scoreboard mimic</p>
            <h2 className="text-2xl font-semibold">Live board preview</h2>
            <p className="text-sm text-slate-300">
              Tailor the scoreboard payload, trigger score bumps, and append log entries to inspect how downstream consumers would see the feed.
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-white/20 bg-[#010203] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
              <div className="rounded-[28px] border border-[#1b1f2b] bg-gradient-to-b from-[#050910] to-[#030508] p-5 shadow-inner shadow-black/60">
                <div className="flex items-start justify-between text-xs uppercase tracking-[0.4em] text-emerald-300">
                  <div>
                    <p className="font-semibold">{scoreboard.status}</p>
                    <p className="text-[0.55rem] tracking-[0.5em] text-emerald-500">
                      {scoreboard.eventName || "event"} · {scoreboard.venueName || "venue"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.55rem] tracking-[0.5em] text-cyan-300">Clock</p>
                    <p className="mt-1 text-3xl font-mono text-lime-200">{scoreboard.clock}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[26px] border border-[#111727] bg-[#03050d] p-4">
                  <div className="rounded-[22px] border border-[#0f1322] bg-gradient-to-b from-[#080d17] to-[#04050b] p-5 shadow-[inset_0_-60px_120px_rgba(0,0,0,0.4)]">
                    <div className="text-center font-mono text-amber-200">
                      <p className="text-[0.55rem] uppercase tracking-[0.45em]">{scoreboard.matchName || "Match title"}</p>
                      <p className="mt-1 text-[0.6rem] tracking-[0.35em] text-amber-400">{scoreboard.highlight || " "}</p>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-4 text-center font-mono">
                      <div
                        className={`rounded-2xl border-2 ${
                          scoreboard.possession === "teamA" ? "border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.6)]" : "border-[#101629]"
                        } p-4`}
                      >
                        <p className="text-[0.55rem] uppercase tracking-[0.5em] text-emerald-300">Team A</p>
                        <p className="mt-1 text-lg tracking-[0.2em] text-white">{scoreboard.teamA}</p>
                        <p className="mt-2 text-6xl font-black text-emerald-200">{scoreboard.scoreA}</p>
                      </div>
                      <div
                        className={`rounded-2xl border-2 ${
                          scoreboard.possession === "teamB" ? "border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.6)]" : "border-[#101629]"
                        } p-4`}
                      >
                        <p className="text-[0.55rem] uppercase tracking-[0.5em] text-cyan-300">Team B</p>
                        <p className="mt-1 text-lg tracking-[0.2em] text-white">{scoreboard.teamB}</p>
                        <p className="mt-2 text-6xl font-black text-cyan-200">{scoreboard.scoreB}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#101629] bg-[#060812] p-4 font-mono text-sm text-slate-200">
                  <p className="text-[0.55rem] uppercase tracking-[0.5em] text-amber-400">Ticker</p>
                  <p className="mt-2 text-lg text-white">{scoreboard.lastUpdate || "Awaiting play data"}</p>
                  <ul className="mt-3 max-h-36 space-y-2 overflow-y-auto text-[0.65rem] tracking-[0.2em] text-slate-300">
                    {logEntries.length === 0 ? (
                      <li className="text-slate-500">No log entries yet.</li>
                    ) : (
                      logEntries.map((entry) => (
                        <li key={entry.id} className="rounded-xl border border-[#151b2e] bg-[#04070f] px-3 py-2">
                          <p className="text-[0.55rem] text-slate-400">
                            {new Date(entry.timestamp).toLocaleTimeString()} · {entry.team}
                          </p>
                          <p className="mt-1 text-white">{entry.detail}</p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { label: "Match title", field: "matchName" },
                  { label: "Event name", field: "eventName" },
                  { label: "Venue name", field: "venueName" },
                ].map((item) => (
                  <label key={item.field} className="text-sm font-medium text-slate-200">
                    {item.label}
                    <input
                      type="text"
                      value={scoreboard[item.field]}
                      onChange={handleScoreboardChange(item.field)}
                      className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                    />
                  </label>
                ))}
                <label className="text-sm font-medium text-slate-200">
                  Status
                  <select
                    value={scoreboard.status}
                    onChange={handleScoreboardChange("status")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-200">
                  Clock
                  <input
                    type="text"
                    value={scoreboard.clock}
                    onChange={handleScoreboardChange("clock")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-200">
                  Team A name
                  <input
                    type="text"
                    value={scoreboard.teamA}
                    onChange={handleScoreboardChange("teamA")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  />
                </label>
                <label className="text-sm font-medium text-slate-200">
                  Team B name
                  <input
                    type="text"
                    value={scoreboard.teamB}
                    onChange={handleScoreboardChange("teamB")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  />
                </label>
                <label className="text-sm font-medium text-slate-200">
                  Possession
                  <select
                    value={scoreboard.possession}
                    onChange={handleScoreboardChange("possession")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  >
                    {POSSESSION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-200">
                  Highlight
                  <input
                    type="text"
                    value={scoreboard.highlight}
                    onChange={handleScoreboardChange("highlight")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-200">
                  Team A score
                  <input
                    type="number"
                    min={0}
                    value={scoreboard.scoreA}
                    onChange={handleScoreboardChange("scoreA")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  />
                </label>
                <label className="text-sm font-medium text-slate-200">
                  Team B score
                  <input
                    type="number"
                    min={0}
                    value={scoreboard.scoreB}
                    onChange={handleScoreboardChange("scoreB")}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => adjustScore("teamA", 1)}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Goal Team A
                </button>
                <button
                  type="button"
                  onClick={() => adjustScore("teamB", 1)}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Goal Team B
                </button>
                <button
                  type="button"
                  onClick={() => adjustScore("teamA", -1)}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Undo A
                </button>
                <button
                  type="button"
                  onClick={() => adjustScore("teamB", -1)}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Undo B
                </button>
              </div>

              <div className="rounded-2xl border border-white/20 p-4">
                <p className="text-sm font-semibold text-slate-200">Log entry</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-xs uppercase text-slate-400">
                    Team
                    <select
                      value={logForm.team}
                      onChange={handleLogChange("team")}
                      className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                    >
                      {POSSESSION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="md:col-span-2 text-xs uppercase text-slate-400">
                    Detail
                    <input
                      type="text"
                      value={logForm.detail}
                      onChange={handleLogChange("detail")}
                      className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white focus:border-white/50 focus:outline-none"
                      placeholder="Goal by Player X"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleAddLogEntry}
                  className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Add log entry
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Raw payload</p>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-800">
{JSON.stringify(rawPayload, null, 2)}
          </pre>
        </section>
      </main>
    </div>
  );
}
