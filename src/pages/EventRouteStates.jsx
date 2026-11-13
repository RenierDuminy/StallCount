// What an event URL shows while its event is being found, or when it cannot be.
import { Link } from "react-router-dom";
import { Card, SectionShell } from "../components/ui/primitives";
import { EVENTS_BASE_PATH } from "./eventWorkspaces";

export function EventNotFound({ message }) {
  return (
    <SectionShell as="main" className="py-6">
      <Card className="space-y-3 p-5 text-center">
        <p className="text-sm text-ink-muted">{message || "We couldn't find that event."}</p>
        <Link to={EVENTS_BASE_PATH} className="sc-button">
          Browse events
        </Link>
      </Card>
    </SectionShell>
  );
}

export function EventLoading() {
  return <p className="p-6 text-center text-sm text-ink-muted">Loading event...</p>;
}
