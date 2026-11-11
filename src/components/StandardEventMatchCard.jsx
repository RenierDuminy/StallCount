import { Link } from "react-router-dom";
import { MatchMediaButton } from "./MatchMediaButton";
import { MatchCard } from "./ui/primitives";
import { getMatchMediaDetails } from "../utils/matchMedia";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function StandardEventMatchCard({
  match,
  eyebrow,
  cornerLabel = "",
  title,
  meta,
  actions,
  score = null,
  status = "Scheduled",
  phase,
  scoreAlign,
  variant = "tinted",
  className = "",
  trailing = undefined,
  hideFinishedVenue = true,
  hideVenue = false,
  hideEyebrow = true,
  hideScheduledStatus = true,
  scheduledVenueNameOnly = true,
  compact = true,
  linkCard = true,
}) {
  const matchHref = match?.id ? `/matches?matchId=${match.id}` : null;
  const shouldLinkCard = linkCard && matchHref;
  const component = shouldLinkCard ? Link : "article";
  const linkProps = shouldLinkCard ? { to: matchHref } : {};
  const mediaDetails = getMatchMediaDetails(match);
  const overlayMediaButton =
    trailing === undefined && mediaDetails ? (
      <MatchMediaButton
        media={mediaDetails}
        className="pointer-events-auto shadow-sm"
      />
    ) : null;
  const resolvedTrailing = trailing === undefined ? null : trailing;

  return (
    // Flex column + grow: when a grid row is taller than this card (a sibling
    // has more content), the card fills the cell instead of stopping short.
    <div className="relative flex flex-col">
      <MatchCard
        as={component}
        variant={variant}
        className={cx(
          "grow",
          shouldLinkCard ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--sc-accent)]/50" : "",
          className,
        )}
        eyebrow={hideEyebrow ? "" : eyebrow || match?.event?.name || "Match"}
        title={title}
        venue={match?.venue}
        meta={meta}
        actions={actions}
        score={score}
        status={status}
        phase={phase}
        scoreAlign={scoreAlign || (score ? "right" : "left")}
        trailing={resolvedTrailing}
        trailingPosition="header"
        hideScheduledStatus={hideScheduledStatus}
        scheduledVenueNameOnly={scheduledVenueNameOnly}
        hideFinishedVenue={hideFinishedVenue}
        hideVenue={hideVenue}
        compact={compact}
        {...linkProps}
      />
      {overlayMediaButton || cornerLabel ? (
        // Top-right corner: an optional label (e.g. the pool) sits to the
        // inside of the stream link, level with the time line at top left.
        <div
          className={cx(
            "pointer-events-none absolute z-10 flex items-start gap-1.5",
            compact ? "right-2.5 top-2.5" : "right-4 top-4",
            // Leave room for the live dot that sits in this corner.
            !overlayMediaButton && /live/i.test(`${status || ""}`) ? "pr-4" : "",
          )}
        >
          {cornerLabel ? (
            <span className="max-w-[9rem] truncate text-xs font-semibold uppercase leading-4 tracking-wide text-ink-muted">
              {cornerLabel}
            </span>
          ) : null}
          {overlayMediaButton}
        </div>
      ) : null}
    </div>
  );
}
