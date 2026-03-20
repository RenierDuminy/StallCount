import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  SectionHeader,
  SectionShell,
} from "../../components/ui/primitives";
import { getEventHierarchy } from "../../services/leagueService";

export const EVENT_ID = "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf";
export const EVENT_SLUG = "stellenbosch-rl-2026";
export const EVENT_NAME = "Stellenbosch RL 2026";
const SUMMARY_RULES_HREF = "/rules/stellenbosch-rl-2026-rules-summary.pdf";
const FULL_RULES_HREF = "/rules/stellenbosch-rl-2026-rules.pdf";
const RULE_DOCUMENTS = [
  {
    name: "Rules-of-Ultimate - STB 5v5 edition (summary).pdf",
    href: SUMMARY_RULES_HREF,
  },
  {
    name: "Rules-of-Ultimate - STB 5v5 edition.pdf",
    href: FULL_RULES_HREF,
  },
];

function PdfIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 16h8M8 12h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StellenboschRl2026WorkspacePage() {
  const [eventData, setEventData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      setError(null);
      try {
        const structure = await getEventHierarchy(EVENT_ID);
        if (!ignore) {
          setEventData(structure || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.message || "Unable to load this event.");
        }
      }
    }

    loadWorkspace();
    return () => {
      ignore = true;
    };
  }, []);

  const workspaceTitle = eventData?.name || EVENT_NAME;

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-6 py-8">
        <Card className="space-y-3 p-6 sm:p-8">
          <SectionHeader
            title={workspaceTitle}
            description={`${workspaceTitle} event workspace.`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/event-rosters?eventId=${encodeURIComponent(EVENT_ID)}`}
                  className="sc-button"
                >
                  View event roster
                </Link>
                <Link
                  to={`/players?eventId=${encodeURIComponent(EVENT_ID)}`}
                  className="sc-button"
                >
                  Player standings
                </Link>
              </div>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {RULE_DOCUMENTS.map((document) => (
              <a
                key={document.href}
                href={document.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition hover:bg-surface-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white">
                  <PdfIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    PDF document
                  </p>
                  <p className="text-sm font-semibold text-ink group-hover:underline break-words whitespace-normal">
                    {document.name}
                  </p>
                </div>
              </a>
            ))}
          </div>
          {error && <div className="sc-alert is-error">{error}</div>}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            title="Under construction"
            description="This page is still under construction, please come back later."
          />
        </Card>
      </SectionShell>
    </div>
  );
}
