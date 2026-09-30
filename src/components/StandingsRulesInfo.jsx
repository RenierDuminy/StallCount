import { useEffect, useId, useRef, useState } from "react";
import { Card } from "./ui/primitives";

const WFDF_APPENDIX_HREF =
  "https://rules.wfdf.sport/wp-content/uploads/2026/03/WFDF-Rules-of-Ultimate-2025-2028-Appendix-v2.0.pdf";

// Plain-language summary of how the standings tables are built. Keep in step
// with src/utils/standings.js (ranking) and src/utils/eventStandings.js (which
// games each table counts).
const TIE_BREAKERS = [
  "Games won in games between the tied teams",
  "Fewest games forfeited",
  "Goal difference in games between the tied teams",
  "Goal difference against common opponents",
  "Goals scored per game in games between the tied teams",
  "Goals scored per game against common opponents",
];

function InfoIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function RulesSection({ title, children }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">{title}</h3>
      <div className="space-y-1.5 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

/**
 * Info button that opens a dialog explaining how the standings are ranked.
 * Closes on the close button, Escape, or a click on the backdrop.
 */
export default function StandingsRulesInfo({ className = "" }) {
  const [open, setOpen] = useState(false);
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
      // Hand focus back to the button that opened the dialog.
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${className}`}
        aria-label="How standings are ranked"
        title="How standings are ranked"
      >
        <InfoIcon className="h-4 w-4" />
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
          <Card className="relative max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto border border-white/70 p-4 shadow-2xl shadow-black/40 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-xl font-semibold text-ink">
                How standings are ranked
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

            <RulesSection title="Division standings">
              <p>
                Each pool is ranked on its own pool games, following the WFDF ranking
                criteria. Only games with a result count: finished games and forfeits.
                Scheduled games show as grey dots but do not count yet.
              </p>
              <p>
                Games a team played outside its pool (crossovers) are shown as dots after
                the &ldquo; - &rdquo;, but they do not affect the order, W-L or +/-.
                Playoff games never appear here.
              </p>
            </RulesSection>

            <RulesSection title="Ranking order">
              <p>Teams are ranked by games won. Teams level on wins are separated by:</p>
              <ol className="list-decimal space-y-1 pl-5">
                {TIE_BREAKERS.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ol>
              <p>
                Each step ranks all the tied teams at once. If a step separates only some
                of them, the teams still level start again from step 1, looking only at
                games among themselves. A tied team that has not yet played the others
                counts as having won none of those games.
              </p>
              <p>
                If teams are still level after every step, WFDF decides by a disc throw;
                here they are listed alphabetically.
              </p>
            </RulesSection>

            <RulesSection title="W-L and +/-">
              <p>
                W-L is games won and lost. +/- is total points scored minus points
                conceded. +/- is shown for information only and is not used to rank
                teams &mdash; which is why a team can sit above another with a better
                +/- after beating them head to head.
              </p>
            </RulesSection>

            <RulesSection title="Forfeits">
              <p>
                When a team is recorded as forfeiting, the other team is given the win,
                5&ndash;0 if no score was entered. The forfeit counts against the
                forfeiting team in the &ldquo;fewest games forfeited&rdquo; step.
              </p>
            </RulesSection>

            <RulesSection title="Final standings">
              <p>
                With playoffs, final places come from the playoff bracket&rsquo;s
                placement games, read top to bottom: the top game (the Final) decides
                1st and 2nd, the next one 3rd and 4th, and so on, with the winner
                placed above the loser. A placement game not yet played leaves both
                teams level, shown as &ldquo;3=&rdquo;. Final standings with playoffs
                count playoff games only.
              </p>
              <p>
                Without playoffs, the final table ranks every team in the division on
                all its games by the rules above, once the event is complete.
              </p>
            </RulesSection>

            <p className="border-t border-white/20 pt-3 text-xs text-ink-muted">
              Source:{" "}
              <a href={WFDF_APPENDIX_HREF} target="_blank" rel="noreferrer" className="underline">
                WFDF Rules of Ultimate 2025&ndash;2028 Appendix, section B3
              </a>
              .
            </p>
          </Card>
        </div>
      ) : null}
    </>
  );
}
