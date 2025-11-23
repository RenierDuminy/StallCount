import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getDivisions, getEventsList } from "../services/leagueService";
import { getRecentMatches } from "../services/matchService";
import { getPlayerDirectory } from "../services/playerService";
import { getAllTeams } from "../services/teamService";
import {
  deleteSubscriptionById,
  getSubscriptions,
  resolveTopicsInput,
  upsertSubscription,
} from "../services/subscriptionService";

const TARGET_OPTIONS = [
  { value: "match", label: "Match" },
  { value: "team", label: "Team" },
  { value: "player", label: "Player" },
  { value: "event", label: "Event" },
  { value: "division", label: "Division" },
];

const TOPIC_PRESETS = [
  "match_start",
  "goal",
  "match_final",
  "turnover",
  "timeout_start",
  "stoppage_start",
  "halftime_start",
];

function uniqueTopics(topics) {
  return Array.from(
    new Set(
      (topics || [])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export default function NotificationsPage() {
  const { session, loading: authLoading } = useAuth();
  const profileId = session?.user?.id ?? null;

  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [targetType, setTargetType] = useState(TARGET_OPTIONS[0].value);
  const [targetId, setTargetId] = useState("");
  const [selectedTopics, setSelectedTopics] = useState(["match_start", "match_final"]);
  const [customTopics, setCustomTopics] = useState("");
  const [topicEdits, setTopicEdits] = useState({});
  const [choices, setChoices] = useState([]);
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [choiceSearch, setChoiceSearch] = useState("");

  const topicOptions = useMemo(
    () => TOPIC_PRESETS.map((topic) => ({ value: topic, label: topic.replace(/_/g, " ") })),
    [],
  );

  useEffect(() => {
    if (!profileId) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(null);
    getSubscriptions(profileId)
      .then((rows) => {
        if (!ignore) setSubscriptions(rows);
      })
      .catch((err) => {
        if (!ignore) setError(err.message || "Unable to load subscriptions.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    const loadChoices = async () => {
      setChoiceLoading(true);
      try {
        let rows = [];
        if (targetType === "event") {
          rows = await getEventsList(200);
        } else if (targetType === "match") {
          rows = await getRecentMatches(200);
        } else if (targetType === "team") {
          rows = await getAllTeams(200);
        } else if (targetType === "player") {
          rows = await getPlayerDirectory();
        } else if (targetType === "division") {
          rows = await getDivisions(200);
        }
        if (!cancelled) {
          setChoices(rows || []);
        }
      } catch (err) {
        console.error("[Notifications] Failed to load selectable targets", err);
        if (!cancelled) {
          setChoices([]);
        }
      } finally {
        if (!cancelled) {
          setChoiceLoading(false);
        }
      }
    };
    loadChoices();
    return () => {
      cancelled = true;
    };
  }, [targetType]);

  const isLoggedOut = !authLoading && !profileId;

  function toggleTopic(value) {
    setSelectedTopics((prev) => {
      if (prev.includes(value)) {
        return prev.filter((topic) => topic !== value);
      }
      return [...prev, value];
    });
  }

  function buildTopicsFromForm() {
    return uniqueTopics([...selectedTopics, ...resolveTopicsInput(customTopics)]);
  }

  const filteredChoices = useMemo(() => {
    if (!choiceSearch.trim()) return choices;
    const text = choiceSearch.toLowerCase();
    return choices.filter((item) => {
      const haystack = [
        item.name,
        item.full_name,
        item.short_name,
        item.location,
        item.level,
        item.type,
        item.start_time,
        item.id,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystack.some((entry) => entry.includes(text));
    });
  }, [choiceSearch, choices]);

  async function handleCreateSubscription(event) {
    event.preventDefault();
    if (!profileId) {
      setError("You must be signed in to manage notifications.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const topics = buildTopicsFromForm();
      const trimmedId = targetId.trim();
      if (!trimmedId) {
        throw new Error("Target ID is required.");
      }
      await upsertSubscription({
        profileId,
        targetType,
        targetId: trimmedId,
        topics,
      });
      setSuccess("Follow preferences saved.");
      setTargetId("");
      setCustomTopics("");
      setSelectedTopics(["match_start", "match_final"]);
      const rows = await getSubscriptions(profileId);
      setSubscriptions(rows);
    } catch (err) {
      setError(err.message || "Unable to save subscription.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTopics(sub) {
    if (!profileId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const raw = topicEdits[sub.id] ?? (sub.topics || []).join(", ");
      const topics = uniqueTopics(resolveTopicsInput(raw));
      await upsertSubscription({
        profileId,
        targetType: sub.target_type,
        targetId: sub.target_id,
        topics,
      });
      setSuccess("Topics updated.");
      const rows = await getSubscriptions(profileId);
      setSubscriptions(rows);
    } catch (err) {
      setError(err.message || "Unable to update topics.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sub) {
    if (!sub?.id || !profileId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteSubscriptionById(sub.id);
      const rows = await getSubscriptions(profileId);
      setSubscriptions(rows);
      setSuccess("Unfollowed.");
    } catch (err) {
      setError(err.message || "Unable to remove subscription.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f7f4] pb-16 text-[var(--sc-ink)]">
      <header className="border-b border-emerald-900/10 bg-[#072013] py-6 text-emerald-50">
        <div className="sc-shell space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Notifications</p>
          <h1 className="text-3xl font-semibold">Follow updates across StallCount</h1>
          <p className="max-w-3xl text-sm text-emerald-100">
            Manage which matches, teams, players, events, or divisions you follow. Subscriptions use the universal
            follow table in Supabase and topics filter which event types trigger alerts.
          </p>
        </div>
      </header>

      <main className="sc-shell space-y-6 py-6">
        {isLoggedOut && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            Sign in to create or manage your notification subscriptions.
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            {success}
          </div>
        )}

        <section className="sc-card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Follow something new</h2>
            <p className="text-sm text-[var(--sc-ink-muted)]">Pick a target and the topics you care about.</p>
          </div>
          <form className="grid gap-4 lg:grid-cols-[1fr,1fr]" onSubmit={handleCreateSubscription}>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--sc-ink)]">
                Target type
                <select
                  className="mt-1 w-full rounded-2xl border border-[var(--sc-border)] bg-white px-3 py-2 text-sm"
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value);
                    setTargetId("");
                    setChoiceSearch("");
                  }}
                  disabled={saving || isLoggedOut}
                >
                  {TARGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[var(--sc-ink)]">
                  Pick a {targetType}
                </label>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-[var(--sc-border)] bg-white px-3 py-2 text-sm"
                  placeholder="Search by name, location, or ID"
                  value={choiceSearch}
                  onChange={(e) => setChoiceSearch(e.target.value)}
                  disabled={saving || isLoggedOut}
                />
                <div className="max-h-56 overflow-auto rounded-2xl border border-[var(--sc-border)] bg-white">
                  {choiceLoading ? (
                    <p className="px-3 py-2 text-xs text-[var(--sc-ink-muted)]">Loading {targetType}s...</p>
                  ) : filteredChoices.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-[var(--sc-ink-muted)]">No results.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--sc-border)]/60 text-sm">
                      {filteredChoices.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetId(item.id);
                              setChoiceSearch(item.name || item.full_name || item.short_name || item.id);
                            }}
                            className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition ${
                              targetId === item.id
                                ? "bg-emerald-50 text-emerald-900"
                                : "hover:bg-[var(--sc-surface)]"
                            }`}
                            disabled={saving || isLoggedOut}
                          >
                            <div>
                              <p className="font-semibold">
                                {item.name || item.full_name || item.short_name || "Untitled"}
                              </p>
                              <p className="text-xs text-[var(--sc-ink-muted)]">
                                {item.location ||
                                  item.level ||
                                  item.start_time ||
                                  item.type ||
                                  item.short_name ||
                                  "ID: " + item.id}
                              </p>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              Select
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input type="hidden" value={targetId} required readOnly />
              </div>

              <div className="rounded-2xl border border-[var(--sc-border)] bg-white/70 px-3 py-3 text-xs text-[var(--sc-ink-muted)]">
                <p className="font-semibold text-[var(--sc-ink)]">How this works</p>
                <ul className="mt-1 space-y-1 list-disc pl-4">
                  <li>Each row in <code>public.subscriptions</code> maps you to one entity.</li>
                  <li>Topics are matched against <code>live_events.event_type</code> / match log events.</li>
                  <li>Leave topics empty to pause alerts for that target.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-[var(--sc-ink)]">Topics</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {topicOptions.map((topic) => {
                    const checked = selectedTopics.includes(topic.value);
                    return (
                      <label
                        key={topic.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                          checked ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[var(--sc-border)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTopic(topic.value)}
                          className="h-4 w-4"
                          disabled={saving || isLoggedOut}
                        />
                        {topic.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="block text-sm font-semibold text-[var(--sc-ink)]">
                Additional topics (comma or newline separated)
                <textarea
                  className="mt-1 w-full rounded-2xl border border-[var(--sc-border)] bg-white px-3 py-2 text-sm"
                  rows={3}
                  placeholder="e.g. custom_event, roster_change"
                  value={customTopics}
                  onChange={(e) => setCustomTopics(e.target.value)}
                  disabled={saving || isLoggedOut}
                />
              </label>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--sc-accent)] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || isLoggedOut}
              >
                {saving ? "Saving..." : "Save subscription"}
              </button>
            </div>
          </form>
        </section>

        <section className="sc-card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Your subscriptions</h2>
              <p className="text-sm text-[var(--sc-ink-muted)]">One row per target you follow.</p>
            </div>
            <span className="rounded-full border border-[var(--sc-border)] px-3 py-1 text-xs font-semibold text-[var(--sc-accent)]">
              {loading ? "Loading..." : `${subscriptions.length} tracked`}
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-6 text-center text-sm text-[var(--sc-ink-muted)]">
              Loading subscriptions...
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)] px-5 py-6 text-center text-sm text-[var(--sc-ink-muted)]">
              No subscriptions yet. Add one above to start receiving notifications.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {subscriptions.map((sub) => (
                <article
                  key={sub.id}
                  className="flex flex-col gap-3 rounded-3xl border border-[var(--sc-border)] bg-white p-4 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-accent)]">
                        {sub.target_type}
                      </p>
                      <p className="break-all font-semibold text-[var(--sc-ink)]">{sub.target_id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(sub)}
                      disabled={saving}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Unfollow
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[var(--sc-ink-muted)]">Topics</p>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[var(--sc-border)] bg-white px-3 py-2 text-sm"
                      value={topicEdits[sub.id] ?? (sub.topics || []).join(", ")}
                      onChange={(e) =>
                        setTopicEdits((prev) => ({
                          ...prev,
                          [sub.id]: e.target.value,
                        }))
                      }
                      placeholder="comma separated topics"
                      disabled={saving}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateTopics(sub)}
                        disabled={saving}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Update topics
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopicEdits((prev) => ({ ...prev, [sub.id]: (sub.topics || []).join(", ") }))}
                        disabled={saving}
                        className="rounded-xl border border-[var(--sc-border)] px-3 py-2 text-xs font-semibold text-[var(--sc-ink)]"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--sc-ink-muted)]">
                    Created {sub.created_at ? new Date(sub.created_at).toLocaleString() : "recently"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
