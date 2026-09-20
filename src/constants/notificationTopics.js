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
 */
export const TOPIC_EVENT_CODES = {
  match_start: ["match_start"],
  match_end: ["match_end"],
  score: ["score", "callahan"],
  turnover: ["turnover", "block"],
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

/** Order shown in the Notifications UI, loosely by how often each fires. */
export const TOPIC_PRESETS = [
  "match_start",
  "score",
  "match_end",
  "halftime",
  "turnover",
  "timeout",
  "stoppage",
];

export const TOPIC_LABELS = {
  match_start: "Match start",
  match_end: "Match end",
  score: "Point scored",
  turnover: "Turnover / block",
  halftime: "Halftime",
  timeout: "Timeout",
  stoppage: "Stoppage",
};

export const TOPIC_DESCRIPTIONS = {
  match_start: "When the match kicks off",
  match_end: "Final score when the match ends",
  score: "Every point, including Callahans",
  turnover: "Possession changes and blocks",
  halftime: "Start and end of the halftime break",
  timeout: "Start and end of each timeout",
  stoppage: "Play stopped and resumed",
};

/** Topics ticked for a new subscription. */
export const DEFAULT_TOPICS = ["match_start", "score", "match_end"];

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
