import { useState } from "react";
import { Link } from "react-router-dom";
import { isIOSDevice, isStandaloneApp } from "../utils/installEnvironment";

// Dismissible pointer from an event page to the Notifications page, where a
// visitor can follow teams and players. The link pre-selects this event
// (NotificationsPage reads ?targetType=&targetId=). Dismissal is remembered
// per event, so a new event shows it again.

const dismissKey = (eventId) => `stallcount:event-follow-notice-dismissed:${eventId}`;

function readDismissed(eventId) {
  try {
    return window.localStorage.getItem(dismissKey(eventId)) === "1";
  } catch {
    return false;
  }
}

export default function EventFollowNotice({ eventId }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(eventId));

  if (!eventId || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissKey(eventId), "1");
    } catch {
      // Storage blocked: the notice returns on the next visit.
    }
    setDismissed(true);
  };

  const href = `/notifications?targetType=event&targetId=${encodeURIComponent(eventId)}`;
  // On iPhone, alerts only reach the installed app, so say so up front.
  const showIPhoneNote = isIOSDevice() && !isStandaloneApp();

  return (
    <div
      role="status"
      className="relative space-y-3 rounded-2xl border border-[var(--sc-accent)] bg-[var(--sc-surface)] p-3 pr-10 sm:p-4 sm:pr-12"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 rounded p-1.5 text-ink-muted transition hover:text-ink"
        aria-label="Dismiss"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 shrink-0 text-ink"
            aria-hidden="true"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        <h2 className="text-lg font-semibold text-ink">Get alerts for this event</h2>
      </div>

      <p className="text-sm text-ink">
        Follow teams and/or players to get alerts, even with the app closed.
      </p>

      <ul className="space-y-1 pl-5 text-sm text-ink list-disc">
        <li>
          <strong>Event or division:</strong> match starts and results from within the selected
          event or division.
        </li>
        <li>
          <strong>Team:</strong> game start, end and every point.
        </li>
        <li>
          <strong>Player:</strong> goals, assists and blocks.
        </li>
      </ul>

      <p className="text-xs text-ink-muted">
        Sign in, then allow notifications when asked.
        {showIPhoneNote ? (
          <>
            {" "}
            <strong className="text-ink">iPhone:</strong> install the app first.
          </>
        ) : null}
      </p>

      <Link to={href} className="sc-button is-ghost w-full sm:w-auto">
        Go to Notifications
      </Link>
    </div>
  );
}
