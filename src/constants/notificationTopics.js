// Single source of truth for notification topics.
//
// A "topic" is what a user subscribes to; an "event code" is what the database
// actually writes into `live_events.event_type` (see MATCH_LOG_EVENT_CODES in
// services/matchLogService.ts, mirrored by the `match_events` table). The two
// vocabularies are NOT the same and must be mapped explicitly.
//
// This module is imported by the Notifications page. The Edge Function
// (supabase/functions/notification-dispatcher) and the local fallback
// (scripts/sendLiveEventNotifications.js) cannot import from the Vite bundle,
// so they carry verbatim copies of TOPIC_EVENT_CODES. Change one, change all
// three - that drift is exactly what broke match-end alerts.
//
// History: the UI once offered a topic called `match_final`, which the database
// has never emitted (it emits `match_end`). Every subscription written before
// 2026-09-20 therefore stored `match_final` and silently never matched, so no
// match-end notification was ever delivered. Stored topics are NOT migrated -
// LEGACY_TOPIC_ALIASES keeps those rows working, the same way the scorekeeper
// keeps its legacy "7v7"/"5v5" session strings rather than orphaning live data.

/**
 * Topic -> the `live_events.event_type` codes it should deliver.
 *
 * Grouping a start/end pair under one topic is deliberate: a user who asks
 * about timeouts wants both edges, and splitting them doubles the checkbox
 * count for no real choice. `score` covers `callahan` because a Callahan is a
 * goal; a subscriber to points wants it.
 *
 * `turnover` and `block` are separate so a player follow can ask for one
 * without the other (the turnover row names the thrower, the block row names
 * the defender). Until 2026-10-07 `turnover` delivered both; the migration
 * 20261007120000_split_block_notification_topic.sql gave every stored
 * `turnover` row a `block` topic so nobody lost alerts.
 */
export const TOPIC_EVENT_CODES = {
  match_start: ["match_start"],
  match_end: ["match_end"],
  score: ["score", "callahan"],
  turnover: ["turnover"],
  block: ["block"],
  halftime: ["halftime_start", "halftime_end"],
  timeout: ["timeout_start", "timeout_end"],
  stoppage: ["stoppage_start", "stoppage_end"],
};

/**
 * Topics stored by older builds, mapped onto their current equivalent. Read
 * when matching, never written. Removing an entry silently breaks every
 * subscription row still holding that string.
 */
export const LEGACY_TOPIC_ALIASES = {
  match_final: "match_end",
  goal: "score",
  halftime_start: "halftime",
  timeout_start: "timeout",
  stoppage_start: "stoppage",
};

/**
 * Target types in the order the Notifications UI lists them, broadest first.
 * Division is not listed: it is picked as an optional narrowing of an event,
 * and saved as target_type "division". It keeps its own entries below so
 * those rows still get topics and defaults.
 */
export const TARGET_TYPE_OPTIONS = [
  { value: "event", label: "Event" },
  { value: "team", label: "Team" },
  { value: "match", label: "Match" },
  { value: "player", label: "Player" },
];

// A checkbox in the UI. One option may write several topics ("Turnover /
// block" writes both), and is shown ticked only when all of them are stored.
const OPTION_START = {
  key: "match_start",
  label: "Start",
  description: "When the match kicks off",
  topics: ["match_start"],
};
const OPTION_END = {
  key: "match_end",
  label: "End",
  description: "Final score when the match ends",
  topics: ["match_end"],
};
const OPTION_HALF = {
  key: "halftime",
  label: "Half",
  description: "Start and end of the halftime break",
  topics: ["halftime"],
};
const OPTION_TIMEOUT = {
  key: "timeout",
  label: "Time out",
  description: "Start and end of each timeout",
  topics: ["timeout"],
};
const OPTION_STOPPAGE = {
  key: "stoppage",
  label: "Stoppage",
  description: "Play stopped and resumed",
  topics: ["stoppage"],
};
const OPTION_SCORE = {
  key: "score",
  label: "Score",
  description: "Every point, including Callahans",
  topics: ["score"],
};

const MATCH_FLOW_OPTIONS = [
  OPTION_START,
  OPTION_END,
  OPTION_HALF,
  OPTION_TIMEOUT,
  OPTION_STOPPAGE,
  OPTION_SCORE,
];

const TEAM_MATCH_OPTIONS = [
  ...MATCH_FLOW_OPTIONS,
  {
    key: "turnover_block",
    label: "Turnover / block",
    description: "Every possession change",
    topics: ["turnover", "block"],
  },
];

/**
 * The options each target type offers. A player follow only matches rows that
 * name that player, so match-wide topics (start, half, ...) could never fire
 * for it and are not offered.
 */
export const TARGET_TOPIC_OPTIONS = {
  event: MATCH_FLOW_OPTIONS,
  division: MATCH_FLOW_OPTIONS,
  team: TEAM_MATCH_OPTIONS,
  match: TEAM_MATCH_OPTIONS,
  player: [
    {
      key: "score",
      label: "Score / assist",
      description: "Scores, assists and Callahans",
      topics: ["score"],
    },
    {
      key: "turnover",
      label: "Turnover",
      description: "When they throw a turnover",
      topics: ["turnover"],
    },
    {
      key: "block",
      label: "Block",
      description: "When they get a block",
      topics: ["block"],
    },
  ],
};

/**
 * Topics ticked for a new subscription. Scores are left off for events and
 * divisions: across a whole tournament that is a notification every minute.
 */
export const DEFAULT_TOPICS_BY_TARGET = {
  event: ["match_start", "match_end"],
  division: ["match_start", "match_end"],
  team: ["match_start", "match_end", "score"],
  match: ["match_start", "match_end", "score"],
  player: ["score", "block"],
};

export function getTopicOptions(targetType) {
  return TARGET_TOPIC_OPTIONS[normalise(targetType)] ?? MATCH_FLOW_OPTIONS;
}

export function getDefaultTopics(targetType) {
  return [...(DEFAULT_TOPICS_BY_TARGET[normalise(targetType)] ?? DEFAULT_TOPICS_BY_TARGET.match)];
}

/**
 * The canonical topics a stored subscription covers, as the UI should show
 * them. An empty list means "everything", so every option the target offers
 * is reported as ticked.
 */
export function resolveStoredTopics(targetType, topics) {
  const options = getTopicOptions(targetType);
  if (!Array.isArray(topics) || topics.length === 0) {
    return Array.from(new Set(options.flatMap((option) => option.topics)));
  }
  return Array.from(new Set(topics.map(canonicalTopic).filter(Boolean)));
}

/** True when every topic the option writes is in the list. */
export function isTopicOptionSelected(option, topics) {
  return option.topics.every((topic) => topics.includes(topic));
}

/** Add or remove all of an option's topics. */
export function toggleTopicOption(option, topics) {
  if (isTopicOptionSelected(option, topics)) {
    return topics.filter((topic) => !option.topics.includes(topic));
  }
  return Array.from(new Set([...topics, ...option.topics]));
}

/** Drop topics the target type does not offer, so nothing unreachable is stored. */
export function topicsForTarget(targetType, topics) {
  const allowed = new Set(getTopicOptions(targetType).flatMap((option) => option.topics));
  return Array.from(new Set((topics || []).map(canonicalTopic))).filter((topic) => allowed.has(topic));
}

function normalise(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Resolve a stored topic to its canonical name, following legacy aliases.
 * Unknown topics are returned as-is so an event code stored directly as a
 * topic (e.g. "halftime_end") still has a chance to match exactly.
 */
export function canonicalTopic(topic) {
  const key = normalise(topic);
  if (!key) return "";
  if (TOPIC_EVENT_CODES[key]) return key;
  return LEGACY_TOPIC_ALIASES[key] ?? key;
}

/**
 * True when a subscribed topic should deliver the given event code.
 * Falls back to an exact match so a topic naming a raw event code still works.
 */
export function topicMatchesEventCode(topic, eventCode) {
  const code = normalise(eventCode);
  if (!code) return false;
  const canonical = canonicalTopic(topic);
  if (!canonical) return false;
  const codes = TOPIC_EVENT_CODES[canonical];
  if (Array.isArray(codes)) return codes.includes(code);
  return canonical === code;
}

/**
 * True when a subscription should receive this event. An empty topic list
 * means "everything", matching the dispatcher's long-standing behaviour.
 */
export function subscriptionMatchesEventCode(topics, eventCode) {
  if (!Array.isArray(topics) || topics.length === 0) return true;
  return topics.some((topic) => topicMatchesEventCode(topic, eventCode));
}
