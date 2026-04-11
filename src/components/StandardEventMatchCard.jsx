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
  title,
  meta,
  score = null,
  status = "Scheduled",
  scoreAlign,
  className = "",
  trailing = undefined,
}) {
  const matchHref = match?.id ? `/matches?matchId=${match.id}` : null;
  const component = matchHref ? Link : "article";
  const linkProps = matchHref ? { to: matchHref } : {};
  const mediaDetails = getMatchMediaDetails(match);
  const resolvedTrailing =
    trailing === undefined ? (mediaDetails ? <MatchMediaButton media={mediaDetails} /> : null) : trailing;

  return (
    <MatchCard
      as={component}
      variant="tinted"
      className={cx(
        matchHref ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--sc-accent)]/50" : "",
        className,
      )}
      eyebrow={eyebrow || match?.event?.name || "Match"}
      title={title}
      venue={match?.venue}
      meta={meta}
      score={score}
      status={status}
      scoreAlign={scoreAlign || (score ? "right" : "left")}
      trailing={resolvedTrailing}
      trailingPosition="header"
      {...linkProps}
    />
  );
}
