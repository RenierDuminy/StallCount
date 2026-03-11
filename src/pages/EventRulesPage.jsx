import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Field, Panel, SectionHeader, SectionShell, Select } from "../components/ui/primitives";
import { getEventsList } from "../services/leagueService";

const parseEventRules = (rawRules) => {
  if (!rawRules) return null;
  if (typeof rawRules === "string") {
    try {
      return JSON.parse(rawRules);
    } catch {
      return null;
    }
  }
  if (typeof rawRules === "object") return rawRules;
  return null;
};

const formatDate = (value) => {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const formatRuleKey = (key) => {
  if (!key) return "";
  const normalized = `${key}`
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatRuleValue = (value) => {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not set";
  return String(value);
};

const TOP_LEVEL_RULE_ORDER = ["format", "division", "game", "half"];

function RulesIndentedList({ value, eventName }) {
  const headingClassByDepth = (depth) => {
    if (depth <= 0) return "text-base font-semibold text-ink";
    if (depth === 1) return "text-sm font-semibold text-ink";
    return "text-xs font-semibold uppercase tracking-wide text-ink";
  };

  const renderRuleNode = (label, node, path = [], depth = 0) => {
    const key = [...path, label || "root"].join(".");

    if (!isPlainObject(node) && !Array.isArray(node)) {
      return (
        <li key={key} className="relative pl-4 before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:bg-border/80 after:absolute after:top-3 after:left-0 after:h-px after:w-3 after:bg-border">
          <div className="text-sm text-ink">
          {label ? <span className="font-semibold">{formatRuleKey(label)}: </span> : null}
          <span className="text-ink-muted">{formatRuleValue(node)}</span>
          </div>
        </li>
      );
    }

    if (Array.isArray(node)) {
      return (
        <li key={key} className="relative space-y-1 pl-4 before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:bg-border/80 after:absolute after:top-3 after:left-0 after:h-px after:w-3 after:bg-border">
          {label ? <p className={headingClassByDepth(depth)}>{formatRuleKey(label)}</p> : null}
          {node.length === 0 ? (
            <p className="text-sm text-ink-muted">No values configured.</p>
          ) : (
            <ul className="relative space-y-1 border-l-2 border-border pl-3 before:absolute before:top-0 before:bottom-0 before:-left-[3px] before:w-px before:bg-border/60">
              {node.map((entry, index) =>
                renderRuleNode(`Item ${index + 1}`, entry, [...path, label || "array"], depth + 1),
              )}
            </ul>
          )}
        </li>
      );
    }

    return (
      <li key={key} className="relative space-y-1 pl-4 before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:bg-border/80 after:absolute after:top-3 after:left-0 after:h-px after:w-3 after:bg-border">
        {label ? <p className={headingClassByDepth(depth)}>{formatRuleKey(label)}</p> : null}
        <ul className="relative space-y-1 border-l-2 border-border pl-3 before:absolute before:top-0 before:bottom-0 before:-left-[3px] before:w-px before:bg-border/60">
          {Object.entries(node).map(([childKey, childValue]) =>
            renderRuleNode(childKey, childValue, [...path, label || "object"], depth + 1),
          )}
        </ul>
      </li>
    );
  };

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const orderedEntries = [
      ...TOP_LEVEL_RULE_ORDER
        .map((key) => entries.find(([entryKey]) => entryKey === key))
        .filter(Boolean),
      ...entries.filter(([entryKey]) => !TOP_LEVEL_RULE_ORDER.includes(entryKey)),
    ];

    return (
      <ul className="space-y-2">
        <li className="relative pl-4 text-sm text-ink before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:bg-border/80 after:absolute after:top-3 after:left-0 after:h-px after:w-3 after:bg-border">
          <span className="font-semibold">Event name: </span>
          <span className="text-ink-muted">{formatRuleValue(eventName || "Not set")}</span>
        </li>
        {orderedEntries.map(([key, entry]) => renderRuleNode(key, entry))}
      </ul>
    );
  }

  return <ul className="space-y-2">{renderRuleNode("", value)}</ul>;
}

export default function EventRulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get("eventId") || "";
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(requestedEventId);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    async function loadEvents() {
      setLoadingEvents(true);
      setError("");
      try {
        const list = await getEventsList(100);
        if (!ignore) {
          setEvents(list || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load events.");
        }
      } finally {
        if (!ignore) {
          setLoadingEvents(false);
        }
      }
    }
    loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!events.length) return;
    let nextId = requestedEventId;
    if (!nextId || !events.some((event) => event.id === nextId)) {
      nextId = events[0]?.id || "";
    }
    setSelectedEventId(nextId);
    if (nextId && requestedEventId !== nextId) {
      setSearchParams({ eventId: nextId }, { replace: true });
    }
    if (!nextId && requestedEventId) {
      setSearchParams({}, { replace: true });
    }
  }, [events, requestedEventId, setSearchParams]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  const rules = useMemo(() => parseEventRules(selectedEvent?.rules), [selectedEvent?.rules]);

  const handleSelectEvent = (eventId) => {
    setSelectedEventId(eventId);
    if (eventId) {
      setSearchParams({ eventId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4 sm:py-6">
        <Card className="space-y-4 p-5 sm:p-7">
          <SectionHeader
            eyebrow="Event rules"
            title="Full ruleset by event"
            description="Inspect the exact rules payload configured on each event."
            action={
              <Field className="w-full max-w-xs" label="Select event" htmlFor="event-rules-filter">
                <Select
                  id="event-rules-filter"
                  value={selectedEventId}
                  onChange={(event) => handleSelectEvent(event.target.value)}
                  disabled={loadingEvents || events.length === 0}
                >
                  {events.length === 0 ? (
                    <option value="">No events available</option>
                  ) : (
                    events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
            }
          />
          {selectedEvent && (
            <div className="text-sm text-ink-muted">
              {selectedEvent.location ? `${selectedEvent.location} - ` : ""}
              {formatDate(selectedEvent.start_date)} to {formatDate(selectedEvent.end_date)}
            </div>
          )}
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        {error && (
          <Card variant="muted" className="border border-rose-300/30 p-4 text-sm text-rose-700">
            {error}
          </Card>
        )}

        <Card className="space-y-4 p-4 sm:p-6">
          <SectionHeader
            eyebrow="Ruleset"
            description={
              selectedEventId
                ? "Structured view of the full event ruleset."
                : "Select an event to display its rules."
            }
          />

          {loadingEvents ? (
            <Panel variant="muted" className="p-5 text-center text-sm text-ink-muted">
              Loading events...
            </Panel>
          ) : !selectedEventId ? (
            <Panel variant="muted" className="p-5 text-center text-sm text-ink-muted">
              Choose an event to see its rules.
            </Panel>
          ) : !rules ? (
            <Panel variant="muted" className="p-5 text-center text-sm text-ink-muted">
              This event does not have a valid ruleset configured.
            </Panel>
          ) : (
            <div className="space-y-3">
              <Panel variant="muted" className="space-y-3 p-4">
                <RulesIndentedList value={rules} eventName={selectedEvent?.name} />
              </Panel>
              <details>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Raw JSON
                </summary>
                <Panel variant="muted" className="mt-2 p-3">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-ink">
                    {JSON.stringify(rules, null, 2)}
                  </pre>
                </Panel>
              </details>
            </div>
          )}
        </Card>
      </SectionShell>
    </div>
  );
}
