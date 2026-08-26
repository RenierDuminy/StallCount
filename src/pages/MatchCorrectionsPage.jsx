import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, SectionHeader, SectionShell } from "../components/ui/primitives";
import { getEventsList } from "../services/leagueService";
import MatchCorrectionsPanel from "./tournamentDirector/MatchCorrectionsPanel";

/**
 * Standalone route for Match corrections.
 *
 * The same panel is also mounted as a tab inside the Tournament Director page.
 * It exists separately because /tournament-director is role-gated to
 * `tournament_director` alone, so a field assistant reaching the tab through
 * that page would be refused before the panel ever rendered. This route carries
 * its own gate (MATCH_CORRECTIONS_ACCESS_ROLES) and shares the panel's state via
 * the same persistence keys, so the event selection follows the user between the
 * two entry points.
 */
export default function MatchCorrectionsPage() {
  const [eventsList, setEventsList] = useState([]);
  const [eventsReady, setEventsReady] = useState(false);

  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      try {
        const rows = await getEventsList(200);
        if (!active) return;
        setEventsList(rows ?? []);
      } catch (err) {
        if (!active) return;
        console.error("[MatchCorrections] Failed to load events", err);
        setEventsList([]);
      } finally {
        // The panel distinguishes "still loading" from "you can access nothing",
        // so this must flip even when the fetch fails.
        if (active) setEventsReady(true);
      }
    };

    loadEvents();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="td-page min-h-screen bg-[#f5fbf6] text-[var(--sc-surface-light-ink)]">
      <SectionShell as="header" className="py-4">
        <Card variant="light" className="space-y-3 p-4 shadow-xl shadow-[rgba(8,25,21,0.08)]">
          <SectionHeader
            title="Match corrections"
            description="Fix mistakes in the point-by-point record after a match has been played."
            action={
              <div className="flex flex-wrap gap-2">
                <Link to="/admin" className="sc-button">
                  Back to admin hub
                </Link>
              </div>
            }
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="pb-8">
        <MatchCorrectionsPanel eventsList={eventsList} eventsReady={eventsReady} />
      </SectionShell>
    </div>
  );
}
