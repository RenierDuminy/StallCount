import { memo } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../../components/ui/primitives";
import { getEventWorkspacePath } from "../eventWorkspaces";
import { formatDateRange, formatEventType } from "./homeFormat";

const HomeEventCard = memo(function HomeEventCard({ event, statusTab, onNow }) {
  const searchParams = new URLSearchParams({ eventId: event.id, status: statusTab });
  const href = getEventWorkspacePath(event.id) || `/events?${searchParams.toString()}`;
  const meta = [formatDateRange(event.start_date, event.end_date), event.location].filter(Boolean).join(" · ");
  const type = formatEventType(event.type);

  return (
    <li>
      <Panel
        as={Link}
        to={href}
        variant="tinted"
        className={`home-list-card${onNow ? " is-on-now" : ""}`}
      >
        <span className="home-row__body">
          <span className="home-list-card__title font-semibold text-ink">
            {onNow ? <span className="home-live-dot" aria-hidden="true" /> : null}
            {event.name}
          </span>
          <span className="text-xs font-semibold text-ink-muted">{meta}</span>
        </span>
        {type ? (
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">{type}</span>
        ) : null}
      </Panel>
    </li>
  );
});

function EventGroup({ label, events, statusTab, onNow = false }) {
  if (events.length === 0) return null;
  return (
    <div>
      <h3 className="home-card-list__heading">{label}</h3>
      <ul className="home-card-list__items">
        {events.map((event) => (
          <HomeEventCard key={event.id} event={event} statusTab={statusTab} onNow={onNow} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Events in two groups — on now, then coming soon — as the same default-style
 * cards "Coming up" uses. Past events are one link away on the Events page
 * rather than a third group here.
 */
export function HomeEventList({ activeEvents, upcomingEvents }) {
  const hasEvents = activeEvents.length > 0 || upcomingEvents.length > 0;

  return (
    <div className="home-card-list">
      <EventGroup label="On now" events={activeEvents} statusTab="active" onNow />
      <EventGroup label="Coming soon" events={upcomingEvents} statusTab="upcoming" />
      {!hasEvents ? <p className="home-card-list__empty">No events on the calendar right now.</p> : null}
      <div className="home-card-list__footer">
        <Link to="/events?status=past" className="home-see-all">
          Past events<span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
