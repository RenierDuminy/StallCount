import { Component } from "react";

// In-memory log — survives re-renders, cleared on full page reload.
//
// Errors are recorded from three sources: React render crashes (this boundary),
// uncaught runtime errors, and unhandled promise rejections. The latter two are
// invisible to React but are exactly what takes a page down, so they matter as
// much as boundary catches for diagnosing a broken deploy.
const MAX_LOG_ENTRIES = 100;
const errorLog = [];
const listeners = new Set();

function emit() {
  // Hand out a fresh array so subscribers relying on identity re-render.
  const snapshot = [...errorLog];
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // A broken listener must not break error reporting itself.
    }
  });
}

export function getErrorLog() {
  return errorLog;
}

export function clearErrorLog() {
  errorLog.length = 0;
  emit();
}

/**
 * Subscribe to error-log changes. Returns an unsubscribe function.
 *
 * Without this, a panel rendering the log only ever sees errors that happened
 * before it mounted — the array mutates in place and React never re-renders.
 */
export function subscribeToErrorLog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Record an error from any source.
 *
 * @param {object} entry
 * @param {string} entry.name    Component or origin label.
 * @param {unknown} entry.error  The thrown value.
 * @param {string} [entry.stack] Component stack, when React supplies one.
 * @param {string} [entry.source] "render" | "window.onerror" | "unhandledrejection"
 */
export function recordError({ name, error, stack = "", source = "render" }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "Unknown component",
    message: error?.message ?? String(error ?? "Unknown error"),
    // The error's own stack points at the throwing code; the component stack
    // points at where it sat in the tree. Both are useful, for different reasons.
    errorStack: typeof error?.stack === "string" ? error.stack : "",
    stack,
    source,
    route: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
    timestamp: new Date().toISOString(),
  };

  // Collapse repeats: a render loop can throw the same error hundreds of times,
  // which would otherwise bury every other error in the panel.
  const previous = errorLog[errorLog.length - 1];
  if (
    previous &&
    previous.message === entry.message &&
    previous.name === entry.name &&
    previous.source === entry.source
  ) {
    previous.count = (previous.count ?? 1) + 1;
    previous.timestamp = entry.timestamp;
    emit();
    return;
  }

  entry.count = 1;
  errorLog.push(entry);
  if (errorLog.length > MAX_LOG_ENTRIES) errorLog.shift();
  emit();
}

let globalHandlersInstalled = false;

/**
 * Capture errors React never sees: uncaught exceptions in event handlers,
 * timers and async code, plus unhandled promise rejections (a failed Supabase
 * call with no catch). Call once at app start.
 */
export function installGlobalErrorCapture() {
  if (globalHandlersInstalled || typeof window === "undefined") return;
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    // Resource load failures (img/script) surface here with no `error` object.
    if (!event.error && !event.message) return;
    const where = event.filename
      ? `${event.filename.split("/").pop()}:${event.lineno}:${event.colno}`
      : "";
    recordError({
      name: where || "Uncaught error",
      error: event.error ?? new Error(event.message),
      source: "window.onerror",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recordError({
      name: "Unhandled promise rejection",
      error: reason instanceof Error ? reason : new Error(String(reason)),
      source: "unhandledrejection",
    });
  });
}

/**
 * A boundary for components that *report* errors.
 *
 * Using the normal ErrorBoundary around the error banner would recurse: the
 * banner throws -> the boundary records it -> the log changes -> subscribers
 * re-render -> the banner throws again. This one renders nothing and writes
 * nothing to the log; it only reports to the console, breaking the cycle.
 *
 * The trade-off is deliberate: a failure here is invisible in-app, but the
 * alternative is an error-reporting component that can take down every page.
 */
export class SilentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { caught: false };
  }

  static getDerivedStateFromError() {
    return { caught: true };
  }

  componentDidCatch(error, info) {
    console.error(
      `[SilentErrorBoundary] ${this.props.name ?? "component"} failed and was hidden:`,
      error,
      info?.componentStack ?? "",
    );
  }

  render() {
    return this.state.caught ? null : this.props.children;
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { caught: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { caught: true, error };
  }

  componentDidCatch(error, info) {
    recordError({
      name: this.props.name ?? "Unknown component",
      error,
      stack: info?.componentStack ?? "",
      source: "render",
    });
  }

  handleReset = () => {
    this.setState({ caught: false, error: null });
  };

  render() {
    if (!this.state.caught) return this.props.children;

    const { fallback } = this.props;
    if (fallback) return fallback;

    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-1 text-rose-600">{this.state.error?.message}</p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
        >
          Try again
        </button>
      </div>
    );
  }
}
