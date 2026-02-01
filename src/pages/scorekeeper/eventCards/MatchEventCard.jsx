import { MATCH_LOG_EVENT_CODES } from "../../../services/matchLogService";

const BLOCK_EVENT_TYPE_ID = 19;
const TEXT_SIZES = {
  s: "text-xs",
  m: "text-sm",
  l: "text-2xl",
};

function formatEventTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveTeamLabels({
  log,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
}) {
  const shortTeamLabel =
    log.team === "B" ? displayTeamBShort : log.team === "A" ? displayTeamAShort : null;
  const fullTeamLabel =
    log.team === "B" ? displayTeamB : log.team === "A" ? displayTeamA : null;
  const resolvedTeamLabel = fullTeamLabel || shortTeamLabel || "Team";

  return {
    shortTeamLabel,
    fullTeamLabel,
    resolvedTeamLabel,
  };
}

function resolveAbbaDescriptor({ log, chronologicalIndex, getAbbaDescriptor }) {
  const abbaLineLabel = log.abbaLine && log.abbaLine !== "none" ? log.abbaLine : null;
  const fallbackAbba =
    typeof getAbbaDescriptor === "function"
      ? getAbbaDescriptor(log.scoreOrderIndex ?? chronologicalIndex)
      : null;
  return abbaLineLabel || fallbackAbba;
}

function getEventFlags(log) {
  const normalizedEventCode = `${log.eventCode || ""}`.toLowerCase();
  const normalizedEventDescription = `${log.eventDescription || ""}`.toLowerCase();
  const isScoreLog = log.eventCode === MATCH_LOG_EVENT_CODES.SCORE;
  const isCalahanLog = log.eventCode === MATCH_LOG_EVENT_CODES.CALAHAN;
  const isMatchStartLog = log.eventCode === MATCH_LOG_EVENT_CODES.MATCH_START;
  const isTimeoutLog =
    log.eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT ||
    log.eventCode === MATCH_LOG_EVENT_CODES.TIMEOUT_START;
  const isBlockLog =
    (Number.isFinite(log.eventTypeId) && log.eventTypeId === BLOCK_EVENT_TYPE_ID) ||
    normalizedEventCode.includes("block") ||
    normalizedEventDescription.includes("block");
  const isPossessionLog =
    log.eventCode === MATCH_LOG_EVENT_CODES.TURNOVER ||
    normalizedEventCode.includes("turnover") ||
    normalizedEventDescription.includes("turnover") ||
    isBlockLog;
  const isHalftimeLog = log.eventCode === MATCH_LOG_EVENT_CODES.HALFTIME_START;
  const isStoppageStart = log.eventCode === MATCH_LOG_EVENT_CODES.STOPPAGE_START;
  const isScoringDisplay = isScoreLog || isCalahanLog;

  return {
    normalizedEventCode,
    normalizedEventDescription,
    isScoreLog,
    isCalahanLog,
    isMatchStartLog,
    isTimeoutLog,
    isBlockLog,
    isPossessionLog,
    isHalftimeLog,
    isStoppageStart,
    isScoringDisplay,
  };
}

function getAlignClass({ log, isPossessionLog, overrideAlign }) {
  if (overrideAlign) return overrideAlign;
  if (isPossessionLog) {
    return log.team === "A" ? "text-right" : log.team === "B" ? "text-left" : "text-center";
  }
  return log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
}

function getGenericEventStyles(flags, variantOverrides) {
  if (variantOverrides?.bg || variantOverrides?.border || variantOverrides?.label) {
    return {
      bg: variantOverrides?.bg || "bg-white",
      border: variantOverrides?.border || "border-slate-300",
      label: variantOverrides?.label || "text-black",
    };
  }

  if (flags.isCalahanLog) {
    return { bg: "bg-[#f0fff4]", border: "border-[#c6f6d5]", label: "text-black" };
  }
  if (flags.isScoreLog) {
    return { bg: "bg-[#e5ffe8]", border: "border-[#16a34a]/70", label: "text-black" };
  }
  if (flags.isTimeoutLog || flags.isStoppageStart) {
    return { bg: "bg-[#fef3c7]", border: "border-[#f59e0b]/60", label: "text-black" };
  }
  if (flags.isHalftimeLog) {
    return { bg: "bg-[#e0e7ff]", border: "border-[#4338ca]/50", label: "text-black" };
  }
  if (flags.isPossessionLog) {
    return { bg: "bg-[#cffafe]", border: "border-[#06b6d4]/60", label: "text-black" };
  }
  return { bg: "bg-white", border: "border-slate-300", label: "text-black" };
}

function getEditPositionClass(editLocation) {
  return editLocation === "middle-right"
    ? "right-3 top-1/2 -translate-y-1/2"
    : "right-3 bottom-3";
}

function EditButton({
  onClick,
  positionClass,
  textClass,
  borderClass,
  hoverBorderClass,
  hoverBgClass,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute ${positionClass} rounded-full border px-2.5 py-1 transition ${borderClass} ${textClass} ${hoverBorderClass} ${hoverBgClass}`}
      aria-label="Edit event"
      title="Edit event"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

function OptimisticBadge({ isOptimistic }) {
  if (!isOptimistic) return null;
  return (
    <span className="absolute left-3 top-3 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
      syncing
    </span>
  );
}

export function MatchEventCard({
  log,
  chronologicalIndex,
  editIndex,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
  getAbbaDescriptor,
  openScoreModal,
  openSimpleEventModal,
  openPossessionEditModal,
  editLocation = "bottom-right",
  variantOverrides = null,
}) {
  const flags = getEventFlags(log);
  const { shortTeamLabel, fullTeamLabel, resolvedTeamLabel } = resolveTeamLabels({
    log,
    displayTeamA,
    displayTeamB,
    displayTeamAShort,
    displayTeamBShort,
  });
  const abbaDescriptor = flags.isScoringDisplay
    ? resolveAbbaDescriptor({ log, chronologicalIndex, getAbbaDescriptor })
    : null;
  const eventTime = formatEventTime(log.timestamp);
  const alignClass = getAlignClass({
    log,
    isPossessionLog: flags.isPossessionLog,
    overrideAlign: variantOverrides?.align,
  });
  const eventStyles = getGenericEventStyles(flags, variantOverrides);
  const description = flags.isMatchStartLog
    ? `Pulling team: ${fullTeamLabel || "Unassigned"}`
    : flags.isTimeoutLog
      ? `${resolvedTeamLabel} timeout`
      : flags.isHalftimeLog
        ? "Halftime reached"
        : flags.isStoppageStart
          ? "Match stoppage"
          : null;
  const creditedPlayerLabel = flags.isPossessionLog
    ? log.scorerName || (log.scorerId ? "Unknown player" : "Unassigned")
    : null;
  const matchStartLayoutClass = flags.isMatchStartLog ? "flex flex-col justify-center" : "";
  const detailSpacingClass = flags.isMatchStartLog ? "mt-2" : "mt-3";
  const editHandler = flags.isScoringDisplay
    ? () => openScoreModal(log.team, "edit", editIndex)
    : flags.isPossessionLog
      ? () => openPossessionEditModal(log, editIndex)
      : () => openSimpleEventModal(log, editIndex);
  const showEdit = editLocation !== "none";
  const editPositionClass = getEditPositionClass(editLocation);
  const editColorClass =
    variantOverrides?.editText ||
    (eventStyles.label === "text-white" ? "text-white" : "text-[#0f5132]");
  const editBorderClass = variantOverrides?.editBorder || "border-border";
  const editHoverBorderClass = variantOverrides?.editHoverBorder || "hover:border-[#0f5132]";
  const editHoverBgClass = variantOverrides?.editHoverBg || "hover:bg-[#e6fffa]";
  const editSpacingClass = showEdit
    ? editLocation === "bottom-right"
      ? "relative pr-12 pb-10"
      : "relative pr-12"
    : "";

  return (
    <article
      className={`relative rounded-2xl border px-4 py-3 transition ${eventStyles.bg} ${eventStyles.border} ${eventStyles.label} ${alignClass} ${matchStartLayoutClass} ${editSpacingClass}`}
    >
      <OptimisticBadge isOptimistic={log?.isOptimistic} />
      <div className={`w-full ${alignClass}`}>
        <p className={`${TEXT_SIZES.m} font-semibold uppercase tracking-wide ${eventStyles.label}`}>
          {flags.isMatchStartLog ? "Match start" : log.eventDescription || "Match event"}
          {!flags.isScoringDisplay && !flags.isMatchStartLog && shortTeamLabel
            ? ` - ${shortTeamLabel}`
            : ""}
        </p>
        {abbaDescriptor && (
          <p className={`${TEXT_SIZES.l} font-extrabold uppercase tracking-wide ${eventStyles.label}`}>
            {abbaDescriptor}
          </p>
        )}
        {description && <p className={`${TEXT_SIZES.s} ${eventStyles.label}`}>{description}</p>}
        <p className={`${TEXT_SIZES.s} ${eventStyles.label}`}>{eventTime}</p>
      </div>

      {flags.isScoringDisplay ? (
        <div className={`${detailSpacingClass} grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]`}>
          {log.team === "A" ? (
            <div className={`text-left ${TEXT_SIZES.m} ${eventStyles.label}`}>
              <p className={`font-semibold ${eventStyles.label}`}>{displayTeamA}</p>
              <p className={`font-semibold ${eventStyles.label}`}>
                {log.assistName ? `${log.assistName} -> ` : ""}
                {log.scorerName || "Unassigned"}
              </p>
            </div>
          ) : (
            <div />
          )}

          <p className={`text-center ${TEXT_SIZES.l} font-semibold ${eventStyles.label}`}>
            {log.totalA} - {log.totalB}
          </p>

          {log.team === "B" ? (
            <div className={`text-right ${TEXT_SIZES.m} ${eventStyles.label}`}>
              <p className={`font-semibold ${eventStyles.label}`}>{displayTeamB}</p>
              <p className={`font-semibold ${eventStyles.label}`}>
                {log.assistName ? `${log.assistName} -> ` : ""}
                {log.scorerName || "Unassigned"}
              </p>
            </div>
          ) : (
            <div />
          )}
        </div>
      ) : (
        <div
          className={`${detailSpacingClass} ${TEXT_SIZES.m} ${eventStyles.label} ${
            flags.isPossessionLog
              ? "flex flex-col items-start gap-1"
              : `flex items-center ${description ? "justify-between" : "justify-end"}`
          }`}
        >
          {(description || flags.isPossessionLog) && (
            <p>
              {flags.isPossessionLog
                ? `${resolvedTeamLabel} now has the disc`
                : flags.isTimeoutLog
                  ? `${resolvedTeamLabel} called a timeout`
                  : flags.isStoppageStart
                    ? "Clock paused while stoppage is logged"
                    : flags.isHalftimeLog
                      ? "Second-half prep underway"
                      : ""}
            </p>
          )}
          {flags.isPossessionLog && (
            <p className={`${TEXT_SIZES.s} font-semibold ${eventStyles.label}/70`}>
              Credited: {creditedPlayerLabel}
            </p>
          )}
        </div>
      )}
      {showEdit && (
        <EditButton
          onClick={editHandler}
          positionClass={editPositionClass}
          textClass={editColorClass}
          borderClass={editBorderClass}
          hoverBorderClass={editHoverBorderClass}
          hoverBgClass={editHoverBgClass}
        />
      )}
    </article>
  );
}

export function ScoreEventCard({
  log,
  chronologicalIndex,
  editIndex,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
  getAbbaDescriptor,
  openScoreModal,
}) {
  const { resolvedTeamLabel } = resolveTeamLabels({
    log,
    displayTeamA,
    displayTeamB,
    displayTeamAShort,
    displayTeamBShort,
  });
  const abbaDescriptor = resolveAbbaDescriptor({ log, chronologicalIndex, getAbbaDescriptor });
  const descriptionAlignClass =
    log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
  const eventTime = formatEventTime(log.timestamp);

  return (
    <article className="relative rounded-2xl border border-[#16a34a]/70 bg-[#e5ffe8] px-4 py-3 text-black pr-12">
      <OptimisticBadge isOptimistic={log?.isOptimistic} />
      <div className="text-center">
        <p className={`${TEXT_SIZES.m} font-semibold uppercase tracking-wide`}>Score</p>
        <p className={`${TEXT_SIZES.s}`}>{eventTime}</p>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <p className={`text-center ${TEXT_SIZES.l} font-semibold text-black`}>
          {log.totalA} - {log.totalB}
        </p>
        <div className={`w-full ${TEXT_SIZES.m} text-black ${descriptionAlignClass}`}>
          <p className="font-semibold text-black">
            {log.team === "B" && abbaDescriptor ? (
              <span className="mr-2 font-semibold uppercase">{abbaDescriptor} -</span>
            ) : null}
            {resolvedTeamLabel}
            {log.team === "A" && abbaDescriptor ? (
              <span className="ml-2 font-semibold uppercase">- {abbaDescriptor}</span>
            ) : null}
          </p>
          <p className="font-semibold text-black">
            {log.assistName ? `${log.assistName} -> ` : ""}
            {log.scorerName || "Unassigned"}
          </p>
        </div>
      </div>

      <EditButton
        onClick={() => openScoreModal(log.team, "edit", editIndex)}
        positionClass="right-3 top-1/2 -translate-y-1/2"
        textClass="text-[#0f5132]"
        borderClass="border-border"
        hoverBorderClass="hover:border-[#0f5132]"
        hoverBgClass="hover:bg-[#e6fffa]"
      />
    </article>
  );
}

export function CalahanEventCard({
  log,
  chronologicalIndex,
  editIndex,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
  getAbbaDescriptor,
  openScoreModal,
}) {
  const { resolvedTeamLabel } = resolveTeamLabels({
    log,
    displayTeamA,
    displayTeamB,
    displayTeamAShort,
    displayTeamBShort,
  });
  const abbaDescriptor = resolveAbbaDescriptor({ log, chronologicalIndex, getAbbaDescriptor });
  const descriptionAlignClass =
    log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
  const eventTime = formatEventTime(log.timestamp);

  return (
    <article className="relative rounded-2xl border-4 border-[#facc15] bg-[#e5ffe8] px-4 py-3 text-[#b45309] pr-12">
      <OptimisticBadge isOptimistic={log?.isOptimistic} />
      <div className="text-center">
        <p className={`${TEXT_SIZES.m} font-semibold uppercase tracking-wide text-[#b45309]`}>Score</p>
        <p className={`${TEXT_SIZES.s} text-[#b45309]`}>{eventTime}</p>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <p className={`text-center ${TEXT_SIZES.l} font-semibold text-[#b45309]`}>
          {log.totalA} - {log.totalB}
        </p>
        <div className={`w-full ${TEXT_SIZES.m} text-[#b45309] ${descriptionAlignClass}`}>
          <p className="font-semibold text-[#b45309]">
            {log.team === "B" && abbaDescriptor ? (
              <span className="mr-2 font-semibold uppercase">{abbaDescriptor} -</span>
            ) : null}
            {resolvedTeamLabel}
            {log.team === "A" && abbaDescriptor ? (
              <span className="ml-2 font-semibold uppercase">- {abbaDescriptor}</span>
            ) : null}
          </p>
          <p className="font-semibold text-[#b45309]">
            {log.assistName ? `${log.assistName} -> ` : ""}
            {log.scorerName || "Unassigned"}
          </p>
        </div>
      </div>

      <EditButton
        onClick={() => openScoreModal(log.team, "edit", editIndex)}
        positionClass="right-3 top-1/2 -translate-y-1/2"
        textClass="text-[#b45309]"
        borderClass="border-[#facc15]"
        hoverBorderClass="hover:border-[#facc15]"
        hoverBgClass="hover:bg-[#dcfce7]"
      />
    </article>
  );
}

export function BlockEventCard({
  log,
  editIndex,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
  openPossessionEditModal,
}) {
  const { resolvedTeamLabel } = resolveTeamLabels({
    log,
    displayTeamA,
    displayTeamB,
    displayTeamAShort,
    displayTeamBShort,
  });
  const alignClass =
    log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
  const eventTime = formatEventTime(log.timestamp);
  const creditedPlayerLabel = log.scorerName || (log.scorerId ? "Unknown player" : "Unassigned");

  return (
    <article className="relative rounded-2xl border border-[#06b6d4]/60 bg-[#cffafe] px-4 py-3 text-black">
      <OptimisticBadge isOptimistic={log?.isOptimistic} />
      <div className="text-center">
        <p className={`${TEXT_SIZES.m} font-semibold uppercase tracking-wide`}>Block</p>
        <p className={`${TEXT_SIZES.s}`}>{eventTime}</p>
      </div>

      <div className={`mt-3 flex flex-col gap-1 ${alignClass} ${TEXT_SIZES.m}`}>
        <p>{`${resolvedTeamLabel} now has the disc`}</p>
        <p className={`${TEXT_SIZES.s} font-semibold text-black/70`}>Credited: {creditedPlayerLabel}</p>
      </div>

      <EditButton
        onClick={() => openPossessionEditModal(log, editIndex)}
        positionClass="right-3 top-3"
        textClass="text-[#0f5132]"
        borderClass="border-border"
        hoverBorderClass="hover:border-[#0f5132]"
        hoverBgClass="hover:bg-[#e6fffa]"
      />
    </article>
  );
}

export function TurnoverEventCard({
  log,
  editIndex,
  displayTeamA,
  displayTeamB,
  displayTeamAShort,
  displayTeamBShort,
  openPossessionEditModal,
}) {
  const { resolvedTeamLabel } = resolveTeamLabels({
    log,
    displayTeamA,
    displayTeamB,
    displayTeamAShort,
    displayTeamBShort,
  });
  const alignClass =
    log.team === "A" ? "text-left" : log.team === "B" ? "text-right" : "text-center";
  const eventTime = formatEventTime(log.timestamp);
  const creditedPlayerLabel = log.scorerName || (log.scorerId ? "Unknown player" : "Unassigned");

  return (
    <article className="relative rounded-2xl border border-[#06b6d4]/60 bg-[#cffafe] px-4 py-3 text-black">
      <OptimisticBadge isOptimistic={log?.isOptimistic} />
      <div className="flex flex-col items-center text-center">
        <p className={`${TEXT_SIZES.m} font-semibold uppercase tracking-wide`}>Turnover</p>
        <p className={`${TEXT_SIZES.s}`}>{eventTime}</p>
      </div>

      <div className={`mt-3 flex flex-col gap-1 ${alignClass} ${TEXT_SIZES.m}`}>
        <p>{`${resolvedTeamLabel} now has the disc`}</p>
        <p className={`${TEXT_SIZES.s} font-semibold text-black/70`}>Credited: {creditedPlayerLabel}</p>
      </div>

      <EditButton
        onClick={() => openPossessionEditModal(log, editIndex)}
        positionClass="right-3 top-3"
        textClass="text-[#0f5132]"
        borderClass="border-border"
        hoverBorderClass="hover:border-[#0f5132]"
        hoverBgClass="hover:bg-[#e6fffa]"
      />
    </article>
  );
}
