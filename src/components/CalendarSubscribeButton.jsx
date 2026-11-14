import { useEffect, useId, useRef, useState } from "react";
import { Card } from "./ui/primitives";
import { calendarFeedUrl, calendarWebcalUrl, googleCalendarSubscribeUrl } from "../utils/calendarLinks";

/**
 * "Add to calendar" for an event's matches, or one team's matches within an
 * event. Opens a dialog with subscribe links (Apple / Outlook, Google) and a
 * copyable feed URL. The feed is api/calendar.js.
 *
 * Renders nothing for a concluded event: the feed is retired then (still
 * served to existing subscribers, but no longer offered).
 */
export default function CalendarSubscribeButton({
  eventId,
  teamId = null,
  concluded = false,
  label = "Add to calendar",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const closeRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const trigger = triggerRef.current;
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      trigger?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!eventId || concluded) return null;

  const feedUrl = calendarFeedUrl({ eventId, teamId });
  const scope = teamId ? "this team's matches at this event" : "every match at this event";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link is shown in full below to copy by hand.
      setCopied(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`sc-button whitespace-nowrap ${className}`}
      >
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3 py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <Card className="relative max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto border border-white/70 p-4 shadow-2xl shadow-black/40 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-xl font-semibold text-ink">
                Add to calendar
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 text-ink-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                aria-label="Close"
                title="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm leading-relaxed text-ink-muted">
              Subscribe to {scope}. Kick-off times, venues and final scores keep themselves up to
              date in your calendar.
            </p>

            <div className="grid gap-2">
              <a href={calendarWebcalUrl(feedUrl)} className="sc-button w-full text-center">
                Apple Calendar or Outlook
              </a>
              <a
                href={googleCalendarSubscribeUrl(feedUrl)}
                target="_blank"
                rel="noreferrer"
                className="sc-button w-full text-center"
              >
                Google Calendar
              </a>
              <button type="button" onClick={copyLink} className="sc-button w-full">
                {copied ? "Link copied" : "Copy calendar link"}
              </button>
            </div>

            <p className="break-all rounded border border-white/20 px-2 py-1.5 font-mono text-xs text-ink-muted">
              {feedUrl}
            </p>

            <p className="text-xs leading-relaxed text-ink-muted">
              Apple Calendar and Outlook check for changes about every 15 minutes. Google Calendar
              decides for itself and can take several hours.
            </p>
          </Card>
        </div>
      ) : null}
    </>
  );
}
