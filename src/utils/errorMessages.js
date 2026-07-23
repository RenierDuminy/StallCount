// Turns raw fetch/Supabase failures into short, specific, actionable messages.
//
// The browser's native network failure is "TypeError: NetworkError when attempting
// to fetch resource" (Firefox) / "TypeError: Failed to fetch" (Chrome) / "Load
// failed" (Safari). That tells an operator on a field nothing. These helpers name
// the action that failed, why it failed, and what happens next — on one line.

// Postgres / PostgREST codes worth distinguishing to a scorekeeper.
const CODE_HINTS = {
  // Postgres
  "23502": { label: "missing required field", advice: "A value the database requires wasn't sent." },
  "23503": { label: "linked record missing", advice: "The team, player or match it points at no longer exists." },
  "23505": { label: "already recorded", advice: "This entry was already saved — refresh the log." },
  "22P02": { label: "invalid value", advice: "A field has the wrong format." },
  "40001": { label: "conflicting update", advice: "Someone else changed this at the same time. Retry." },
  "42501": { label: "permission denied", advice: "Your role can't perform this. Ask a tournament director." },
  "42P01": { label: "table missing", advice: "The database is missing a table. Contact an admin." },
  "42703": { label: "column missing", advice: "The database schema is out of date. Contact an admin." },
  // PostgREST
  PGRST116: { label: "not found", advice: "The record no longer exists — refresh." },
  PGRST301: { label: "session expired", advice: "Sign in again to continue." },
  PGRST204: { label: "column missing", advice: "The database schema is out of date. Contact an admin." },
};

const HTTP_HINTS = {
  400: { label: "rejected by server", advice: "The request was malformed." },
  401: { label: "not signed in", advice: "Sign in again to continue." },
  403: { label: "permission denied", advice: "Your role can't perform this." },
  404: { label: "not found", advice: "The record no longer exists — refresh." },
  409: { label: "conflict", advice: "This clashes with an existing record." },
  413: { label: "payload too large", advice: "Too much data in one request." },
  429: { label: "rate limited", advice: "Too many requests — wait a moment." },
  500: { label: "server error", advice: "Supabase failed. Try again shortly." },
  502: { label: "bad gateway", advice: "Supabase is unreachable. Try again shortly." },
  503: { label: "service unavailable", advice: "Supabase is down or paused. Try again shortly." },
  504: { label: "server timeout", advice: "Supabase took too long. Try again." },
};

/**
 * Rewrap a Supabase/PostgREST error as an Error while preserving the fields that
 * make a message specific. `throw new Error(error.message)` discards code/details/
 * hint/status, which collapses every failure into the same generic string.
 */
export function fromSupabaseError(error, fallbackMessage = "Request failed") {
  const wrapped = new Error(error?.message || fallbackMessage);
  if (error?.code) wrapped.code = error.code;
  if (error?.details) wrapped.details = error.details;
  if (error?.hint) wrapped.hint = error.hint;
  if (error?.status) wrapped.status = error.status;
  return wrapped;
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkError(error) {
  if (!error) return false;
  const name = String(error.name || "");
  const message = String(error.message || "").toLowerCase();
  if (name === "AbortError") return true;
  if (
    name === "TypeError" &&
    (message.includes("fetch") ||
      message.includes("network") ||
      message.includes("load failed"))
  ) {
    return true;
  }
  return message.includes("networkerror") || message.includes("failed to fetch");
}

function getStatus(error) {
  const status = error?.status ?? error?.statusCode ?? error?.originalError?.status;
  return Number.isFinite(Number(status)) ? Number(status) : null;
}

// Our own thrown errors are already written for operators — don't rewrite them.
function isAuthoredMessage(error) {
  const message = String(error?.message || "");
  if (!message) return false;
  if (isNetworkError(error)) return false;
  if (error?.code) return false;
  if (getStatus(error)) return false;
  // Heuristic: authored messages read as sentences, driver noise does not.
  return /[a-z]\s[a-z]/i.test(message) && message.length < 200;
}

/**
 * Build a one-line, specific description of a failure.
 *
 * @param {unknown} error   The caught error.
 * @param {object} options
 * @param {string} options.action   What was being attempted, e.g. "Save score".
 * @param {string} [options.queued] Text describing offline fallback, e.g. "queued to sync".
 * @returns {string}
 */
export function describeError(error, options = {}) {
  const { action = null, queued = null } = options;
  const prefix = action ? `${action} failed` : "Request failed";

  if (isOffline()) {
    return queued
      ? `${prefix}: you're offline — ${queued}.`
      : `${prefix}: you're offline. Reconnect and try again.`;
  }

  if (isNetworkError(error)) {
    const timedOut = String(error?.name) === "AbortError";
    const why = timedOut ? "the request timed out" : "can't reach the server";
    return queued
      ? `${prefix}: ${why} — ${queued}. Check your signal.`
      : `${prefix}: ${why}. Check your signal, then retry.`;
  }

  const code = error?.code ? String(error.code) : null;
  const hint = code ? CODE_HINTS[code] : null;
  if (hint) {
    return `${prefix}: ${hint.label} (${code}). ${hint.advice}`;
  }

  const status = getStatus(error);
  const httpHint = status ? HTTP_HINTS[status] : null;
  if (httpHint) {
    return `${prefix}: ${httpHint.label} (${status}). ${httpHint.advice}`;
  }

  if (isAuthoredMessage(error)) {
    return error.message;
  }

  const raw = String(error?.message || "").trim();
  const detail = String(error?.details || "").trim();
  const tail = [raw, detail].filter(Boolean).join(" — ") || "unknown error";
  return `${prefix}: ${code ? `${tail} (${code})` : tail}`;
}

// Compact banner text for the offline/queue state, shown outside a catch block.
export function describeQueuedWrite(action = "Changes") {
  return isOffline()
    ? `${action} queued — you're offline. They'll sync when you reconnect.`
    : `${action} queued — the server didn't respond. Retrying automatically.`;
}
