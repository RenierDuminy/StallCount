import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  clearScorekeeperSession,
  loadScorekeeperSession,
} from "../../services/scorekeeperSessionStore";
import { getMatchById } from "../../services/matchService";
import { isConcludedStatus } from "../../constants/statusCodes";
import { ScorekeeperShell } from "../../components/ui/scorekeeperPrimitives";
import { SCOREKEEPER_FORMAT_LIST } from "./scorekeeperFormats";
import { MODULAR_SCOREKEEPER_MENU_PATH } from "./scorekeeperConstants";

/**
 * The modular console's menu ("landing page"): pick a format, open the console.
 *
 * This is the console's *only* menu. The console used to carry a second one — an
 * in-page chooser behind `?view=menu` — which duplicated this screen's job; it is
 * gone, and everything that pointed at it points here.
 *
 * The choice is a route change (`?mode=`), not state, so the console mounts
 * fresh with the chosen modules and can never carry a half-configured session
 * across formats. Sessions are namespaced per format, so each card can say
 * whether a match is waiting to be resumed without mounting a controller.
 *
 * `?mode=` carries the *internal* key (`full` / `lite`); the cards show the
 * audience-facing name from the descriptor ("Competitive" / "Casual").
 *
 * A card with no session to resume opens the console straight into match setup
 * (`&setup=1`), which is the only thing the operator can usefully do there —
 * the intermediate "open setup" screen was a dead click. A resumable card skips
 * it so the resume prompt is not buried behind a modal.
 *
 * `?completed=` shows the completion banner, with the value naming how far the
 * operator got: `1` for a Casual match (no spirit scores to enter) and `spirit`
 * for a Competitive one that also submitted them. Either way the operator is
 * dropped back here, and without the banner would have no confirmation that the
 * work actually saved.
 */

/** Banner copy per `?completed=` value. Anything else shows no banner. */
const COMPLETION_VARIANTS = {
  "1": {
    eyebrow: "Match completed",
    heading: "Well done — that’s a wrap.",
    detail: "The match is saved and the score is published. You are free to leave.",
  },
  spirit: {
    eyebrow: "Match and spirit scores completed",
    heading: "Well done — that’s a wrap.",
    detail:
      "The match is saved, the score is published and the spirit scores are submitted. You are free to leave.",
  },
};
export default function ModularScorekeeperLanding() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [searchParams, setSearchParams] = useSearchParams();
  // Held in state and the param stripped immediately, so the banner survives the
  // render it was triggered on but a refresh or a later visit does not
  // re-announce a match that ended some time ago.
  const [completion, setCompletion] = useState(
    () => COMPLETION_VARIANTS[searchParams.get("completed")] || null
  );
  // The initialiser above has already captured the variant, so this only cleans
  // the URL — no setState, which would just re-render for a value that cannot
  // change.
  useEffect(() => {
    if (!searchParams.has("completed")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("completed");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Resumable state per format, keyed by format key. A stored session only counts
  // as resumable once its match is confirmed still open: a match finished from
  // another device (or by the spirit-score step) leaves the session behind, and
  // offering "Resume" for it drops the operator into a console that cannot score.
  // `null` means "not checked yet", so the card does not flicker through a wrong
  // label on first paint.
  const [resumable, setResumable] = useState(null);

  const refreshResumable = useCallback(async (isCancelled = () => false) => {
    if (!userId) {
      setResumable((prev) => (prev && Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const entries = await Promise.all(
      SCOREKEEPER_FORMAT_LIST.map(async (option) => {
        const stored = loadScorekeeperSession(userId, option.sessionRuleset);
        const matchId = stored?.data?.matchId;
        if (!matchId) return [option.key, false];
        try {
          const match = await getMatchById(matchId);
          // A match that has vanished or concluded is not resumable. Clear the
          // stale session so the check does not repeat on every visit.
          if (!match || isConcludedStatus(String(match.status || "").toLowerCase())) {
            clearScorekeeperSession(userId, option.sessionRuleset);
            return [option.key, false];
          }
          return [option.key, true];
        } catch {
          // The status could not be confirmed (offline, transient failure). Keep
          // the session and offer the resume: discarding a live match because a
          // lookup failed is far worse than offering one that turns out stale.
          return [option.key, true];
        }
      }),
    );
    if (isCancelled()) return;
    setResumable(Object.fromEntries(entries));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    // Fetching on mount: every setState inside runs after an await, so this is a
    // subscription to external state (each session's match status), not a
    // synchronous cascade. The lint rule cannot see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshResumable(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [refreshResumable]);

  // Drop every stored session so the operator can set up a fresh match. Only
  // offered when something is actually stored, and confirmed first — it discards
  // a match that may still be in progress.
  const handleStartNewMatch = () => {
    if (!userId) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Discard the saved match progress on this device and start fresh? Anything not yet synced will be lost.",
      );
    if (!confirmed) return;
    SCOREKEEPER_FORMAT_LIST.forEach((option) => {
      clearScorekeeperSession(userId, option.sessionRuleset);
    });
    void refreshResumable();
  };

  const hasAnyResumable = resumable
    ? Object.values(resumable).some(Boolean)
    : false;

  return (
    <ScorekeeperShell>
      <main className="py-2">
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Score keeper</h1>
              <p className="text-sm text-slate-500">Choose how much you want to track for this match.</p>
            </div>
            {/* The menu is the first screen the operator lands on, so the way out
                belongs here rather than only inside the setup modal. `shrink-0`
                keeps it on one line when the heading wraps on a phone. */}
            <Link to="/admin" className="sc-button shrink-0">
              Admin tools
            </Link>
          </div>
          {completion && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-3xl border-2 border-emerald-500 bg-emerald-50 p-4 text-left"
            >
              {/* Same eyebrow/heading/detail structure as the format cards
                  below, so the banner reads as part of this screen rather than a
                  toast bolted onto it. */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {completion.eyebrow}
                </p>
                <p className="mt-1 text-base font-semibold text-emerald-900">
                  {completion.heading}
                </p>
                <p className="mt-1 text-sm text-emerald-800">{completion.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => setCompletion(null)}
                aria-label="Dismiss"
                className="ml-auto shrink-0 rounded-full px-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900"
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {SCOREKEEPER_FORMAT_LIST.map((option) => {
              // Until the status check resolves, treat the card as "set up": it
              // is the safe default, and the only cost is a label that settles a
              // moment later.
              const canResume = Boolean(resumable?.[option.key]);
              const to = canResume
                ? `${MODULAR_SCOREKEEPER_MENU_PATH}?mode=${option.key}`
                : `${MODULAR_SCOREKEEPER_MENU_PATH}?mode=${option.key}&setup=1`;
              return (
                <Link
                  key={option.key}
                  to={to}
                  className="flex min-h-40 flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-brand hover:bg-brand/5"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {option.tagline}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{option.name}</p>
                    <p className="mt-2 text-sm text-slate-600">{option.description}</p>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-brand">
                    {canResume ? "Resume match in progress →" : "Set up match →"}
                  </p>
                </Link>
              );
            })}
          </div>
          {/* The way out of a stuck session: a saved match the operator no longer
              wants is otherwise only cleared by resuming it and ending it. */}
          {hasAnyResumable && (
            <div className="px-1">
              <button
                type="button"
                onClick={handleStartNewMatch}
                className="text-sm font-semibold text-slate-500 underline transition hover:text-slate-900"
              >
                Start a new match instead (discards saved progress)
              </button>
            </div>
          )}
        </section>
      </main>
    </ScorekeeperShell>
  );
}
