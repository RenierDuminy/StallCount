import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDivisions, getEventsList, getEventsByIds } from "../services/leagueService";
import { getRecentMatches } from "../services/matchService";
import { getPlayerDirectory, getPlayersByIds } from "../services/playerService";
import { getAllTeams } from "../services/teamService";
import { getRecentLiveEvents } from "../services/liveEventService";
import { supabase } from "../services/supabaseClient";
import {
  deleteSubscriptionById,
  getSubscriptions,
  resolveTopicsInput,
  upsertSubscription,
} from "../services/subscriptionService";
import { Card, Panel, SectionHeader, SectionShell, Chip, Field, Input, Select, Textarea } from "../components/ui/primitives";

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

const TOPIC_LABELS = {
  match_start: "Match start",
  goal: "Goal",
  match_final: "Match end",
  turnover: "Possession (turnover/block)",
  timeout_start: "Timeout",
  stoppage_start: "Stoppage",
  halftime_start: "Halftime",
};

const TOPIC_EVENT_ALIASES = {
  turnover: ["turnover", "block"],
};

const supportsPush = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const loadPushClient = () => import("../pwa/pushClient");

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

function getEventDataValue(data, ...keys) {
  if (!data) return "";
  for (const key of keys) {
    if (key in data && data[key]) {
      return String(data[key]);
    }
  }
  return "";
}

function formatPlayerLabel(player) {
  if (!player) return "Unknown player";
  const name = player.name || player.full_name || player.short_name || "Unknown player";
  const jerseyNumber = player.jersey_number ?? player.jerseyNumber ?? null;
  if (typeof jerseyNumber === "number") {
    return `${name} #${jerseyNumber}`;
  }
  return name;
}

function topicMatchesEventType(topic, eventType) {
  const normalizedTopic = String(topic || "").toLowerCase();
  const normalizedEventType = String(eventType || "").toLowerCase();
  if (!normalizedTopic || !normalizedEventType) return false;
  if (normalizedTopic === normalizedEventType) return true;
  const aliasTargets = TOPIC_EVENT_ALIASES[normalizedTopic];
  return Array.isArray(aliasTargets) ? aliasTargets.includes(normalizedEventType) : false;
}

function eventMatchesSubscription(event, subscription) {
  if (!subscription?.target_type || !subscription?.target_id) return false;
  const type = String(subscription.target_type).toLowerCase();
  const targetId = String(subscription.target_id);
  const data = event?.data && typeof event.data === "object" ? event.data : {};

  const equalsTarget = (value) => {
    if (value == null) return false;
    return String(value) === targetId;
  };

  let matches = false;
  switch (type) {
    case "match":
      matches = equalsTarget(event.match_id);
      break;
    case "team":
      matches = equalsTarget(getEventDataValue(data, "team_id", "teamId", "team"));
      break;
    case "player":
      matches = equalsTarget(getEventDataValue(data, "player_id", "playerId", "player"));
      break;
    case "event":
      matches = equalsTarget(getEventDataValue(data, "event_id", "eventId"));
      break;
    case "division":
      matches = equalsTarget(getEventDataValue(data, "division_id", "divisionId"));
      break;
    default:
      if (Array.isArray(data.targets)) {
        matches = data.targets.some((target) => {
          if (!target || typeof target !== "object") return false;
          const entry = target;
          return (
            String(entry.type || "").toLowerCase() === type &&
            equalsTarget(entry.id)
          );
        });
      }
      break;
  }

  if (!matches) return false;
  const topics = Array.isArray(subscription.topics) ? subscription.topics : [];
  if (!topics.length) return true;
  const eventType = String(event.event_type || "").toLowerCase();
  return topics.some((topic) => topicMatchesEventType(topic, eventType));
}

export default function NotificationsPage() {
  const [searchParams] = useSearchParams();
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
  const [targetLabels, setTargetLabels] = useState({});
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState(null);
  const [pushState, setPushState] = useState(() => ({
    supported: supportsPush(),
    permission:
      typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
    enabled: false,
    busy: false,
    error: null,
  }));
  const topicOptions = useMemo(
    () =>
      TOPIC_PRESETS.map((topic) => ({
        value: topic,
        label: TOPIC_LABELS[topic] || topic.replace(/_/g, " "),
      })),
    [],
  );
  const notifiedEventIdsRef = useRef(new Set());
  const liveEventsChannelRef = useRef(null);
  const prefillAppliedRef = useRef(false);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const typeParam = searchParams.get("targetType");
    const idParam = searchParams.get("targetId");
    if (!typeParam || !idParam) return;
    const normalizedType = String(typeParam).toLowerCase();
    const validType = TARGET_OPTIONS.some((option) => option.value === normalizedType);
    if (!validType) return;
    setTargetType(normalizedType);
    setTargetId(idParam);
    setChoiceSearch(idParam);
    prefillAppliedRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    notifiedEventIdsRef.current.clear();
  }, [profileId]);

  const showNotificationPayload = useCallback(async (payload) => {
    if (!payload) throw new Error("No notification payload specified.");
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("Browser APIs unavailable.");
    }
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers not supported.");
    }
    if (!("Notification" in window)) {
      throw new Error("Notification API unavailable.");
    }
    if (Notification.permission !== "granted") {
      throw new Error("Permission is not granted.");
    }
    const ready = await navigator.serviceWorker.ready;
    const title =
      typeof payload.title === "string" && payload.title.trim().length
        ? payload.title.trim()
        : "StallCount update";
    const options = {
      body: payload.body || "New activity detected.",
      icon: payload.icon || "/StallCount logo_192_v1.png",
      data: payload.data || { url: "/" },
      vibrate: payload.vibrate || [100, 50, 100],
      requireInteraction: Boolean(payload.requireInteraction),
      tag: payload.tag || "stallcount-event",
    };
    await ready.showNotification(title, options);
  }, []);

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

  const formatMatchChoiceLabel = useCallback((match) => {
    if (!match) return "";
    const teamA = match.team_a?.name || match.team_a?.short_name || "Team A";
    const teamB = match.team_b?.name || match.team_b?.short_name || "Team B";
    return `${teamA} vs ${teamB}`;
  }, []);

  const choiceDisplayLabel = useCallback(
    (item) => {
      if (!item) return "";
      if (targetType === "match") {
        return formatMatchChoiceLabel(item);
      }
      if (targetType === "player") {
        return formatPlayerLabel(item);
      }
      return item.name || item.full_name || item.short_name || "";
    },
    [formatMatchChoiceLabel, targetType],
  );

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
          const nextRows = rows || [];
          setChoices(nextRows);
          if (nextRows.length) {
            setTargetLabels((prev) => {
              const next = { ...prev };
              nextRows.forEach((row) => {
                const label = choiceDisplayLabel(row) || `Unknown ${targetType}`;
                next[`${targetType}:${row.id}`] = label;
              });
              return next;
            });
          }
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
  }, [choiceDisplayLabel, targetType]);

  useEffect(() => {
    const missingEventIds = subscriptions
      .filter((sub) => sub.target_type === "event")
      .map((sub) => sub.target_id)
      .filter((id) => id && !targetLabels[`event:${id}`]);
    if (!missingEventIds.length) return undefined;
    let ignore = false;
    getEventsByIds(missingEventIds)
      .then((rows) => {
        if (ignore || !rows?.length) return;
        setTargetLabels((prev) => {
          const next = { ...prev };
          rows.forEach((row) => {
            next[`event:${row.id}`] = row.name || "Unknown event";
          });
          return next;
        });
      })
      .catch((err) => {
        console.error("[Notifications] Failed to load event labels", err);
      });
    return () => {
      ignore = true;
    };
  }, [subscriptions, targetLabels]);

  useEffect(() => {
    const missingPlayerIds = subscriptions
      .filter((sub) => sub.target_type === "player")
      .map((sub) => sub.target_id)
      .filter((id) => id && !targetLabels[`player:${id}`]);
    if (!missingPlayerIds.length) return undefined;
    let ignore = false;
    getPlayersByIds(missingPlayerIds)
      .then((rows) => {
        if (ignore || !rows?.length) return;
        setTargetLabels((prev) => {
          const next = { ...prev };
          rows.forEach((row) => {
            next[`player:${row.id}`] = formatPlayerLabel(row);
          });
          return next;
        });
      })
      .catch((err) => {
        console.error("[Notifications] Failed to load player labels", err);
      });
    return () => {
      ignore = true;
    };
  }, [subscriptions, targetLabels]);

  useEffect(() => {
    if (!pushState.supported) return undefined;
    let ignore = false;
    const syncSubscription = async () => {
      try {
        const { getExistingSubscription } = await loadPushClient();
        const subscription = await getExistingSubscription();
        if (ignore) return;
        setPushState((prev) => ({
          ...prev,
          enabled: Boolean(subscription),
          permission:
            typeof Notification !== "undefined" ? Notification.permission : prev.permission,
        }));
      } catch {
        if (ignore) return;
        setPushState((prev) => ({ ...prev, enabled: false }));
      }
    };
    void syncSubscription();
    const handleMessage = (event) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        void syncSubscription();
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleMessage);
    return () => {
      ignore = true;
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, [pushState.supported]);

  useEffect(() => {
    if (!profileId) {
      setRecentNotifications([]);
      setRecentLoading(false);
      setRecentError(null);
      return;
    }
    if (!subscriptions.length) {
      setRecentNotifications([]);
      setRecentLoading(false);
      setRecentError(null);
      return;
    }
    let cancelled = false;
    setRecentLoading(true);
    setRecentError(null);
    getRecentLiveEvents(50)
      .then((events) => {
        if (cancelled) return;
        const filtered = (events || []).filter((event) =>
          subscriptions.some((sub) => eventMatchesSubscription(event, sub)),
        );
        setRecentNotifications(filtered.slice(0, 5));
      })
      .catch((err) => {
        if (cancelled) return;
        setRecentError(err.message || "Unable to load recent notifications.");
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, subscriptions]);

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

  const getSubscriptionLabel = useCallback(
    (type, id) => {
      return targetLabels[`${type}:${id}`] || `Unknown ${type}`;
    },
    [targetLabels],
  );

  const handleRealtimeLiveEvent = useCallback(
    (rawEvent) => {
      if (!rawEvent || !subscriptions.length) return;
      const event = normalizeLiveEventRow(rawEvent);
      if (!event) return;
      const matches = subscriptions.some((sub) => eventMatchesSubscription(event, sub));
      if (!matches) return;
      setRecentNotifications((prev) => {
        const filtered = prev.filter((existing) => existing.id !== event.id);
        return [event, ...filtered].slice(0, 5);
      });
    },
    [subscriptions],
  );

  useEffect(() => {
    if (!profileId || !subscriptions.length) {
      if (liveEventsChannelRef.current) {
        supabase.removeChannel(liveEventsChannelRef.current);
        liveEventsChannelRef.current = null;
      }
      return undefined;
    }
    const channel = supabase.channel(`live_events_notifications:${profileId}`);
    liveEventsChannelRef.current = channel;
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_events" },
        (payload) => {
          if (payload?.new) {
            handleRealtimeLiveEvent(payload.new);
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[Notifications] Realtime channel error for live_events");
        }
      });
    return () => {
      if (liveEventsChannelRef.current) {
        supabase.removeChannel(liveEventsChannelRef.current);
        liveEventsChannelRef.current = null;
      }
    };
  }, [handleRealtimeLiveEvent, profileId, subscriptions.length]);

  useEffect(() => {
    if (!recentNotifications.length) return;
    recentNotifications.forEach((event) => {
      if (!event?.id) return;
      if (notifiedEventIdsRef.current.has(event.id)) return;
      notifiedEventIdsRef.current.add(event.id);
      const payload = buildNotificationPayloadFromEvent(event, getSubscriptionLabel);
      if (!payload) return;
      showNotificationPayload(payload).catch((err) => {
        console.error("[Notifications] Unable to display notification", err);
      });
    });
  }, [recentNotifications, getSubscriptionLabel, showNotificationPayload]);

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

  async function handleEnablePush() {
    if (pushState.busy) return;
    setPushState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      if (!profileId) {
        throw new Error("Sign in to enable push notifications.");
      }
      const { ensurePushSubscription } = await loadPushClient();
      await ensurePushSubscription(profileId);
      setPushState((prev) => ({
        ...prev,
        enabled: true,
        busy: false,
        permission:
          typeof Notification !== "undefined" ? Notification.permission : prev.permission,
      }));
    } catch (err) {
      setPushState((prev) => ({
        ...prev,
        busy: false,
        error: err instanceof Error ? err.message : "Failed to enable push notifications.",
        permission:
          typeof Notification !== "undefined" ? Notification.permission : prev.permission,
      }));
    }
  }

  async function handleDisablePush() {
    if (pushState.busy) return;
    setPushState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const { disablePushSubscription } = await loadPushClient();
      await disablePushSubscription(profileId || undefined);
      setPushState((prev) => ({
        ...prev,
        enabled: false,
        busy: false,
      }));
    } catch (err) {
      setPushState((prev) => ({
        ...prev,
        busy: false,
        error: err instanceof Error ? err.message : "Failed to disable push notifications.",
      }));
    }
  }

  return (
    <div className="sc-page">
      <div className="relative z-10">
        <SectionShell as="header" className="pt-6">
          <Card className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <Chip>Notifications</Chip>
                  <span>Follow updates across StallCount</span>
                </div>
                <h1 className="text-3xl font-semibold text-ink">Signal preferences</h1>
                <p className="max-w-2xl text-sm text-ink-muted">
                  Subscribe to matches, teams, players, events, or divisions. Fine-tune the event types you want to be
                  nudged about so your phone only buzzes for the right moments.
                </p>
              </div>
              <Panel variant="muted" className="w-full max-w-xs space-y-1 border border-border p-5 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Active follows</p>
                <p className="text-3xl font-bold text-accent">{loading ? "..." : subscriptions.length}</p>
                <p className="text-[11px] text-ink-muted">targets currently tracked</p>
              </Panel>
            </div>

            <Panel variant="tinted" className="space-y-4 border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-ink">Browser push status</h2>
                  <p className="text-sm text-ink-muted">
                    We use the PWA service worker to deliver alerts in the background. Enable this to receive match
                    updates without opening the site.
                  </p>
                </div>
                <Panel variant="muted" className="w-full max-w-xs space-y-1 border border-border p-4 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Permission</p>
                  <p className="text-lg font-semibold text-ink">{pushState.permission}</p>
                  <p className="text-[11px] text-ink-muted">
                    {pushState.enabled ? "Subscribed" : "Not subscribed"}
                  </p>
                </Panel>
              </div>

              {!pushState.supported ? (
                <Panel variant="muted" className="border border-rose-400/40 bg-rose-500/10 text-sm text-rose-200">
                  Push notifications are not supported in this browser.
                </Panel>
              ) : pushState.permission === "denied" ? (
                <Panel variant="muted" className="border border-rose-400/40 bg-rose-500/10 text-sm text-rose-200">
                  Notifications are blocked in your browser. Update the permission settings and retry.
                </Panel>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={pushState.busy || pushState.enabled}
                    className="sc-button w-full justify-center sm:w-auto"
                  >
                    {pushState.busy ? "Working..." : pushState.enabled ? "Enabled" : "Enable push"}
                  </button>
                  {pushState.enabled && (
                    <button
                      type="button"
                      onClick={handleDisablePush}
                      disabled={pushState.busy}
                      className="sc-button is-ghost w-full justify-center sm:w-auto"
                    >
                      Disable push
                    </button>
                  )}
                </div>
              )}
              {pushState.error && (
                <Panel variant="muted" className="border border-rose-400/40 bg-rose-500/10 text-sm text-rose-200">
                  {pushState.error}
                </Panel>
              )}
            </Panel>
          </Card>
        </SectionShell>

        <SectionShell as="main" className="space-y-6 pb-16">
        {isLoggedOut && (
          <Card variant="muted" className="border border-rose-400/30 p-4 text-sm text-rose-200">
            Sign in to create or manage your notification subscriptions.
          </Card>
        )}

        {error && (
          <Card variant="muted" className="border border-rose-400/45 p-4 text-sm text-rose-200">
            {error}
          </Card>
        )}
        {success && (
          <Card variant="muted" className="border border-emerald-400/30 p-4 text-sm text-ink">
            {success}
          </Card>
        )}

        <Card as="section" className="space-y-5 p-6 sm:p-8">
          <SectionHeader title="Follow something new" description="Pick a target and the topics you care about." />
          <form className="grid gap-4 lg:grid-cols-[1fr,1fr]" onSubmit={handleCreateSubscription}>
            <div className="space-y-3">
              <Field label="Target type" htmlFor="notifications-target-type">
                <Select
                  id="notifications-target-type"
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
                </Select>
              </Field>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-ink">
                  Pick a {targetType}
                </label>
                <Input
                  type="text"
                  placeholder="Search by name or location"
                  value={choiceSearch}
                  onChange={(e) => setChoiceSearch(e.target.value)}
                  disabled={saving || isLoggedOut}
                />
                <div className="max-h-56 overflow-auto rounded-2xl border border-border/80 bg-surface-muted">
                  {choiceLoading ? (
                    <p className="px-3 py-2 text-xs text-ink-muted">Loading {targetType}s...</p>
                  ) : filteredChoices.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-ink-muted">No results.</p>
                  ) : (
                    <ul className="divide-y divide-border/60 text-sm">
                      {filteredChoices.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetId(item.id);
                              setChoiceSearch(choiceDisplayLabel(item));
                            }}
                              className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition ${
                              targetId === item.id
                                ? "bg-[var(--sc-accent)]/10 text-accent"
                                : "hover:bg-[var(--sc-surface)]/80"
                            }`}
                            disabled={saving || isLoggedOut}
                          >
                            <div>
                              <p className="font-semibold text-ink">
                                {choiceDisplayLabel(item) || `Unknown ${targetType}`}
                              </p>
                              <p className="text-xs text-ink-muted">
                                {item.location ||
                                  item.level ||
                                  item.start_time ||
                                  item.type ||
                                  item.short_name ||
                                  "Details unavailable"}
                              </p>
                            </div>
                              <span className="rounded-full bg-[var(--sc-accent)]/90 px-2 py-0.5 text-[10px] font-semibold text-[#041311]">
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

              <Panel variant="muted" className="text-xs text-ink-muted">
                <p className="font-semibold text-ink">How this works</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>Each row in <code>public.subscriptions</code> maps you to one entity.</li>
                  <li>Topics are matched against <code>live_events.event_type</code> / match log events.</li>
                  <li>Leave topics empty to pause alerts for that target.</li>
                </ul>
              </Panel>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">Topics</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {topicOptions.map((topic) => {
                    const checked = selectedTopics.includes(topic.value);
                    return (
                      <label
                        key={topic.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          checked
                            ? "border-[var(--sc-accent)]/70 bg-[var(--sc-accent)]/10 text-accent"
                            : "border-border-strong text-ink hover:border-[var(--sc-accent)]/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTopic(topic.value)}
                          className="h-4 w-4 rounded border-border-strong bg-surface text-accent focus:ring-0"
                          disabled={saving || isLoggedOut}
                        />
                        {topic.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <Field label="Additional topics (comma or newline separated)" htmlFor="notifications-topics">
                <Textarea
                  id="notifications-topics"
                  rows={3}
                  placeholder="e.g. custom_event, roster_change"
                  value={customTopics}
                  onChange={(e) => setCustomTopics(e.target.value)}
                  disabled={saving || isLoggedOut}
                />
              </Field>

              <button
                type="submit"
                className="sc-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || isLoggedOut}
              >
                {saving ? "Saving..." : "Save subscription"}
              </button>
            </div>
          </form>
        </Card>

        <Card as="section" className="space-y-5 p-6 sm:p-8">
          <SectionHeader
            title="Your subscriptions"
            description="One row per target you follow."
            action={<Chip variant="ghost">{loading ? "Loading..." : `${subscriptions.length} tracked`}</Chip>}
          />

          {loading ? (
            <Panel variant="muted" className="border border-dashed border-border bg-transparent py-6 text-center text-sm text-ink-muted">
              Loading subscriptions...
            </Panel>
          ) : subscriptions.length === 0 ? (
            <Panel variant="muted" className="border border-dashed border-border bg-transparent py-6 text-center text-sm text-ink-muted">
              No subscriptions yet. Add one above to start receiving notifications.
            </Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {subscriptions.map((sub) => (
                <Panel key={sub.id} as="article" variant="tinted" className="flex flex-col gap-3 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                        {sub.target_type}
                      </p>
                      <p className="break-all font-semibold text-ink">
                        {getSubscriptionLabel(sub.target_type, sub.target_id)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(sub)}
                      disabled={saving}
                      className="sc-button is-ghost whitespace-nowrap border border-rose-400/40 text-xs text-rose-200 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Unfollow
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-ink-muted">Topics</p>
                    <Input
                      type="text"
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateTopics(sub)}
                        disabled={saving}
                        className="sc-button text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Update topics
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopicEdits((prev) => ({ ...prev, [sub.id]: (sub.topics || []).join(", ") }))}
                        disabled={saving}
                        className="sc-button is-ghost text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-ink-muted">
                    Created {sub.created_at ? new Date(sub.created_at).toLocaleString() : "recently"}
                  </p>
                </Panel>
              ))}
            </div>
          )}
        </Card>

        <Card as="section" className="space-y-5 p-6 sm:p-8">
          <SectionHeader
            title="Recent notifications"
            description="The latest updates that match your follow preferences."
            action={<Chip variant="ghost">{recentNotifications.length} shown</Chip>}
          />

          {isLoggedOut ? (
            <Panel variant="muted" className="text-sm text-ink-muted">
              Sign in and follow something to see recent notifications here.
            </Panel>
          ) : recentError ? (
            <Panel variant="muted" className="border border-rose-400/40 bg-rose-500/15 text-sm text-rose-200">
              {recentError}
            </Panel>
          ) : recentLoading ? (
            <Panel variant="muted" className="border border-dashed border-border bg-transparent py-4 text-center text-sm text-ink-muted">
              Loading recent notifications...
            </Panel>
          ) : recentNotifications.length === 0 ? (
            <Panel variant="muted" className="border border-dashed border-border bg-transparent py-4 text-center text-sm text-ink-muted">
              No recent notifications match your current follows.
            </Panel>
          ) : (
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
              {recentNotifications.map((event) => {
                const data = (event.data && typeof event.data === "object" ? event.data : {}) ?? {};
                const matchLabel =
                  (typeof data.target_name === "string" && data.target_name.trim()) ||
                  (typeof data.match_name === "string" && data.match_name.trim()) ||
                  getSubscriptionLabel("match", event.match_id);
                const title =
                  (typeof data.title === "string" && data.title.trim()) ||
                  (matchLabel ? `Update for ${matchLabel}` : event.event_type.replace(/_/g, " ")) ||
                  "Match update";
                const body =
                  (typeof data.body === "string" && data.body.trim()) ||
                  (typeof data.description === "string" && data.description.trim()) ||
                  (matchLabel ? `New activity for ${matchLabel}` : "");
                const createdAt = event.created_at ? new Date(event.created_at).toLocaleString() : "";
                return (
                  <Panel key={event.id} variant="tinted" className="flex h-full items-start gap-2 p-2">
                    <Chip variant="tag" className="mt-0.5 px-2 py-0 text-[9px]">
                      {event.event_type.replace(/_/g, " ")}
                    </Chip>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-ink line-clamp-1">{title}</p>
                        <p className="whitespace-nowrap text-[9px] text-ink-muted">{createdAt}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-ink-muted line-clamp-1">
                          {body || matchLabel || "Update"}
                        </p>
                        {event.match_id && (
                          <a href={`/matches/${event.match_id}`} className="sc-button is-ghost text-[10px]">
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </Card>

      </SectionShell>
    </div>
  </div>
);
}

function buildNotificationPayloadFromEvent(event, labelResolver) {
  if (!event) return null;
  const rawData = (event.data && typeof event.data === "object" ? event.data : {}) ?? {};

  const matchLabel =
    (typeof rawData.target_name === "string" && rawData.target_name.trim()) ||
    (typeof rawData.match_name === "string" && rawData.match_name.trim()) ||
    (event.match_id ? labelResolver?.("match", event.match_id) : null);

  const formattedType = (event.event_type || "").replace(/_/g, " ").trim();
  const title =
    (typeof rawData.title === "string" && rawData.title.trim()) ||
    (matchLabel ? `Update for ${matchLabel}` : formattedType || "Match update");
  const body =
    (typeof rawData.body === "string" && rawData.body.trim()) ||
    (typeof rawData.description === "string" && rawData.description.trim()) ||
    (matchLabel ? `New activity for ${matchLabel}` : "");

  const payload = {
    title,
    body,
    icon: rawData.icon || "/StallCount logo_192_v1.png",
    data: {
      ...rawData,
      url: rawData.url || (event.match_id ? `/matches/${event.match_id}` : "/"),
      event_type: event.event_type,
      match_id: event.match_id,
      event_id: event.id,
    },
    tag: rawData.tag || event.event_type || "stallcount-event",
    requireInteraction: Boolean(rawData.requireInteraction),
  };

  return payload;
}

function normalizeLiveEventRow(event) {
  if (!event) return null;
  let data = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      // leave data as string if parsing fails
    }
  }
  return { ...event, data };
}
