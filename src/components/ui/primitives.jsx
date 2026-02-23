function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const cardVariants = {
  base: "sc-card-base",
  muted: "sc-card-muted",
  frosted: "sc-card-base sc-frosted",
  light: "sc-surface-light",
  bordered: "rounded-2xl border border-border bg-surface",
};

const panelVariants = {
  default: "rounded-2xl border border-border bg-surface",
  muted: "rounded-2xl border border-border bg-surface-muted",
  dashed: "rounded-2xl border border-dashed border-border bg-surface",
  blank: "rounded-2xl border border-border",
  tinted: "rounded-2xl sc-panel",
  tintedAlt: "rounded-2xl sc-panel-alt",
  featured: "rounded-2xl sc-feature-panel",
  light: "rounded-2xl sc-surface-light border border-[#0b1f19]/20 text-[var(--sc-surface-light-ink)]",
};

const chipVariants = {
  default: "sc-chip",
  tag: "sc-tag",
  ghost: "sc-pill-ghost",
};

const MATCH_CARD_PHASES = {
  scheduled: "scheduled",
  live: "live",
  finished: "finished",
};

const MATCH_CARD_PHASE_DEFAULT_LABELS = {
  [MATCH_CARD_PHASES.scheduled]: "Scheduled",
  [MATCH_CARD_PHASES.live]: "Live",
  [MATCH_CARD_PHASES.finished]: "Finished",
};

const MATCH_CARD_LIVE_STATUSES = new Set(["live", "halftime", "in_progress", "in progress"]);
const MATCH_CARD_FINISHED_STATUSES = new Set(["finished", "completed", "final"]);

const MATCH_CARD_PHASE_STYLES = {
  [MATCH_CARD_PHASES.scheduled]: {
    panelClass: "border-amber-400/35",
    statusClass: "text-amber-200",
  },
  [MATCH_CARD_PHASES.live]: {
    panelClass: "border-rose-400/45 bg-rose-500/5",
    statusClass: "text-rose-300",
  },
  [MATCH_CARD_PHASES.finished]: {
    panelClass: "border-emerald-400/35",
    statusClass: "text-emerald-300",
  },
};

function toSafeLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveMatchCardPhase(phase, status) {
  const normalizedPhase = toSafeLabel(phase).toLowerCase();
  if (normalizedPhase === MATCH_CARD_PHASES.scheduled) return MATCH_CARD_PHASES.scheduled;
  if (normalizedPhase === MATCH_CARD_PHASES.live) return MATCH_CARD_PHASES.live;
  if (normalizedPhase === MATCH_CARD_PHASES.finished || normalizedPhase === "completed") {
    return MATCH_CARD_PHASES.finished;
  }

  const normalizedStatus = toSafeLabel(status).toLowerCase();
  if (MATCH_CARD_LIVE_STATUSES.has(normalizedStatus)) return MATCH_CARD_PHASES.live;
  if (MATCH_CARD_FINISHED_STATUSES.has(normalizedStatus)) return MATCH_CARD_PHASES.finished;
  return MATCH_CARD_PHASES.scheduled;
}

function formatFinishedPhaseScore(scoreLabel, title) {
  const compactScoreMatch = /^\s*([^-]+?)\s*-\s*([^-]+?)\s*$/.exec(scoreLabel || "");
  if (!compactScoreMatch) return scoreLabel;

  const titleText = toSafeLabel(title);
  const titleParts = titleText.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
  if (titleParts.length !== 2) return scoreLabel;

  const leftScore = compactScoreMatch[1].trim();
  const rightScore = compactScoreMatch[2].trim();
  return `${titleParts[0]} ${leftScore} - ${rightScore} ${titleParts[1]}`;
}

function isMatchupTitle(title) {
  return /\s+vs\s+/i.test(toSafeLabel(title));
}

function getFinishedPhaseScoreParts(scoreLabel, title) {
  const compactScoreMatch = /^\s*([^-]+?)\s*-\s*([^-]+?)\s*$/.exec(scoreLabel || "");
  if (!compactScoreMatch) return null;

  const titleText = toSafeLabel(title);
  const titleParts = titleText.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
  if (titleParts.length !== 2) return null;

  return {
    teamA: titleParts[0],
    teamB: titleParts[1],
    scoreA: compactScoreMatch[1].trim(),
    scoreB: compactScoreMatch[2].trim(),
  };
}

function shouldStackFinishedScore(parts) {
  if (!parts) return false;
  const totalLength = parts.teamA.length + parts.teamB.length;
  const hasLongToken =
    /[^\s]{18,}/.test(parts.teamA) ||
    /[^\s]{18,}/.test(parts.teamB);
  return totalLength > 44 || parts.teamA.length > 24 || parts.teamB.length > 24 || hasLongToken;
}

function getLongestTokenLength(value) {
  const tokens = toSafeLabel(value).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  return tokens.reduce((max, token) => (token.length > max ? token.length : max), 0);
}

function getFinishedTeamNameSizeClass(name) {
  const label = toSafeLabel(name);
  const totalLength = label.length;
  const longestToken = getLongestTokenLength(label);

  if (totalLength <= 18 && longestToken <= 12) return "text-2xl";
  if (totalLength <= 26 && longestToken <= 14) return "text-xl";
  if (totalLength <= 34 && longestToken <= 18) return "text-lg";
  if (totalLength <= 46 && longestToken <= 24) return "text-base";
  return "text-sm";
}

export function SectionShell({ as: Component = "section", className = "", children, ...props }) {
  return (
    <Component className={cx("sc-shell", className)} {...props}>
      {children}
    </Component>
  );
}

export function Card({ as: Component = "div", variant = "base", className = "", children, ...props }) {
  const variantClass = cardVariants[variant] || cardVariants.base;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function Panel({ as: Component = "div", variant = "default", className = "", children, ...props }) {
  const variantClass = panelVariants[variant] || panelVariants.default;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function MatchCard({
  as: Component = "article",
  variant = "tintedAlt",
  className = "",
  eyebrow = "Match",
  title,
  venue,
  meta,
  actions,
  score,
  status,
  phase,
  scoreAlign = "left",
  trailing,
  ...props
}) {
  const venueLabel = (() => {
    if (!venue) return "";
    if (typeof venue === "string") return venue.trim();
    if (typeof venue !== "object") return "";
    const city = toSafeLabel(venue.city);
    const location = toSafeLabel(venue.location);
    const name = toSafeLabel(venue.name);
    const lead = [city, location].filter(Boolean).join(", ");
    if (lead && name) return `${lead} - ${name}`;
    return lead || name || "";
  })();
  const scoreLabel =
    typeof score === "string" ? score.trim() : score === null || score === undefined ? "" : String(score);
  const statusLabel =
    typeof status === "string" ? status.trim() : status === null || status === undefined ? "" : String(status);
  const matchPhase = resolveMatchCardPhase(phase, statusLabel);
  const phaseStyle = MATCH_CARD_PHASE_STYLES[matchPhase] || MATCH_CARD_PHASE_STYLES[MATCH_CARD_PHASES.scheduled];
  const displayStatus = statusLabel || MATCH_CARD_PHASE_DEFAULT_LABELS[matchPhase];
  const displayScore =
    matchPhase === MATCH_CARD_PHASES.finished ? formatFinishedPhaseScore(scoreLabel, title) : scoreLabel;
  const finishedScoreParts =
    matchPhase === MATCH_CARD_PHASES.finished ? getFinishedPhaseScoreParts(scoreLabel, title) : null;
  const stackFinishedScore = shouldStackFinishedScore(finishedScoreParts);
  const finishedTeamANameClass = finishedScoreParts ? getFinishedTeamNameSizeClass(finishedScoreParts.teamA) : "";
  const finishedTeamBNameClass = finishedScoreParts ? getFinishedTeamNameSizeClass(finishedScoreParts.teamB) : "";
  const showTitle = !(matchPhase === MATCH_CARD_PHASES.finished && isMatchupTitle(title));
  const footerJustify = trailing
    ? "justify-between"
    : matchPhase === MATCH_CARD_PHASES.finished
      ? "justify-center"
      : scoreAlign === "right"
        ? "justify-end"
        : "justify-start";
  const scoreAlignClass =
    matchPhase === MATCH_CARD_PHASES.finished ? "text-center" : scoreAlign === "right" ? "text-right" : "text-left";

  return (
    <Panel
      as={Component}
      variant={variant}
      className={cx("flex flex-col gap-3 p-4", phaseStyle.panelClass, className)}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <div>
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{eyebrow}</p> : null}
          {showTitle && title ? <h3 className="text-lg font-semibold text-ink">{title}</h3> : null}
          {venueLabel ? (
            <p className="text-xs font-semibold text-ink-muted">{venueLabel}</p>
          ) : null}
        </div>
        {meta || actions ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {meta ? <p className="text-xs text-ink-muted">{meta}</p> : <span />}
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
      </div>
      {displayScore || displayStatus || trailing ? (
        <div className={cx("flex min-w-0 items-center gap-3", footerJustify)}>
          {displayScore || displayStatus ? (
            <div className={cx("min-w-0", scoreAlignClass)}>
              {finishedScoreParts ? (
                stackFinishedScore ? (
                  <div className="mx-auto flex w-full max-w-full flex-col items-center gap-1 font-semibold leading-tight">
                    <p className="grid w-full max-w-full grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-2">
                      <span className="text-center text-2xl tabular-nums text-accent">{finishedScoreParts.scoreA}</span>
                      <span
                        className={cx(
                          "min-w-0 max-w-full overflow-hidden whitespace-normal break-normal text-center text-white leading-tight",
                          finishedTeamANameClass,
                        )}
                      >
                        {finishedScoreParts.teamA}
                      </span>
                    </p>
                    <p className="grid w-full max-w-full grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-2">
                      <span className="text-center text-2xl tabular-nums text-accent">{finishedScoreParts.scoreB}</span>
                      <span
                        className={cx(
                          "min-w-0 max-w-full overflow-hidden whitespace-normal break-normal text-center text-white leading-tight",
                          finishedTeamBNameClass,
                        )}
                      >
                        {finishedScoreParts.teamB}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="mx-auto grid w-full max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 font-semibold leading-tight">
                    <span
                      className={cx(
                        "min-w-0 max-w-full overflow-hidden whitespace-normal break-normal text-center text-white leading-tight",
                        finishedTeamANameClass,
                      )}
                    >
                      {finishedScoreParts.teamA}
                    </span>
                    <span className="whitespace-nowrap text-center text-2xl tabular-nums text-accent">
                      {finishedScoreParts.scoreA} - {finishedScoreParts.scoreB}
                    </span>
                    <span
                      className={cx(
                        "min-w-0 max-w-full overflow-hidden whitespace-normal break-normal text-center text-white leading-tight",
                        finishedTeamBNameClass,
                      )}
                    >
                      {finishedScoreParts.teamB}
                    </span>
                  </p>
                )
              ) : displayScore ? (
                <p className="max-w-full break-words text-2xl font-semibold text-accent">{displayScore}</p>
              ) : null}
              {displayStatus ? (
                <p className={cx("text-xs font-semibold uppercase tracking-wide", phaseStyle.statusClass)}>
                  {matchPhase === MATCH_CARD_PHASES.live ? (
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 align-middle" />
                  ) : null}
                  {displayStatus}
                </p>
              ) : null}
            </div>
          ) : (
            <div />
          )}
          {trailing || null}
        </div>
      ) : null}
    </Panel>
  );
}

export function Chip({ as: Component = "span", variant = "default", className = "", children, ...props }) {
  const variantClass = chipVariants[variant] || chipVariants.default;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function Metric({ as: Component = "div", className = "", value, label, children, ...props }) {
  return (
    <Component className={cx("sc-metric", className)} {...props}>
      {children ? (
        children
      ) : (
        <>
          <strong>{value}</strong>
          {label && <span className="text-sm text-ink-muted">{label}</span>}
        </>
      )}
    </Component>
  );
}

export function Field({
  as: Component = "label",
  label,
  hint,
  action,
  children,
  className = "",
  htmlFor,
  ...props
}) {
  const componentProps = { className: cx("sc-fieldset", className), ...props };
  if (Component === "label" && htmlFor) {
    componentProps.htmlFor = htmlFor;
  }
  return (
    <Component {...componentProps}>
      {(label || action) && (
        <div className="flex items-center justify-between gap-3">
          {label ? <span className="sc-field-label">{label}</span> : null}
          {action ? <div className="text-xs text-ink-muted">{action}</div> : null}
        </div>
      )}
      {hint ? <p className="sc-field-hint">{hint}</p> : null}
      {children}
    </Component>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={cx("sc-input", className)} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={cx("sc-input", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={cx("sc-input", className)} {...props} />;
}

export function SectionHeader({
  eyebrow,
  eyebrowVariant = "default",
  title,
  description,
  action,
  children,
  className = "",
  divider = false,
}) {
  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", divider && "border-b border-border pb-4", className)}>
      <div className="space-y-1">
        {eyebrow ? <Chip variant={eyebrowVariant}>{eyebrow}</Chip> : null}
        {title ? <h2 className="text-2xl font-semibold text-ink">{title}</h2> : null}
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
