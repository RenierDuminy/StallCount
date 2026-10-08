import { memo } from "react";
import { MATCH_LOG_EVENT_CODES } from "../../../services/matchLogService";
import {
  MatchEventCard,
  ScoreEventCard,
  CalahanEventCard,
  BlockEventCard,
  TurnoverEventCard,
} from "./MatchEventCard";

export { ScoreEventCard, CalahanEventCard, BlockEventCard, TurnoverEventCard };

export const TimeoutStartEventCard = memo(function TimeoutStartEventCard(props) {
  return <MatchEventCard {...props} editLocation="bottom-right" />;
});

export const TimeoutEndEventCard = memo(function TimeoutEndEventCard(props) {
  return <MatchEventCard {...props} editLocation="bottom-right" />;
});

const HALFTIME_OVERRIDES = { align: "text-center", bg: "bg-[#0f5132]", border: "border-[#0a3b24]", label: "text-white" };

export const HalftimeStartEventCard = memo(function HalftimeStartEventCard(props) {
  return <MatchEventCard {...props} editLocation="middle-right" variantOverrides={HALFTIME_OVERRIDES} />;
});

export const HalftimeEndEventCard = memo(function HalftimeEndEventCard(props) {
  return <MatchEventCard {...props} editLocation="middle-right" variantOverrides={HALFTIME_OVERRIDES} />;
});

const STOPPAGE_OVERRIDES = { align: "text-center", bg: "bg-[#fee2e2]", border: "border-[#ef4444]" };

export const StoppageStartEventCard = memo(function StoppageStartEventCard(props) {
  return <MatchEventCard {...props} editLocation="middle-right" variantOverrides={STOPPAGE_OVERRIDES} />;
});

export const StoppageEndEventCard = memo(function StoppageEndEventCard(props) {
  return <MatchEventCard {...props} editLocation="middle-right" variantOverrides={STOPPAGE_OVERRIDES} />;
});

export const MatchStartEventCard = memo(function MatchStartEventCard(props) {
  return <MatchEventCard {...props} editLocation="none" />;
});

export const MatchEndEventCard = memo(function MatchEndEventCard(props) {
  return <MatchEventCard {...props} editLocation="none" />;
});

export const UnknownEventCard = memo(function UnknownEventCard(props) {
  return <MatchEventCard {...props} editLocation="middle-right" />;
});

const CARD_BY_EVENT_CODE = {
  [MATCH_LOG_EVENT_CODES.SCORE]: ScoreEventCard,
  [MATCH_LOG_EVENT_CODES.CALAHAN]: CalahanEventCard,
  [MATCH_LOG_EVENT_CODES.TURNOVER]: TurnoverEventCard,
  [MATCH_LOG_EVENT_CODES.TIMEOUT_START]: TimeoutStartEventCard,
  [MATCH_LOG_EVENT_CODES.TIMEOUT_END]: TimeoutEndEventCard,
  [MATCH_LOG_EVENT_CODES.HALFTIME_START]: HalftimeStartEventCard,
  [MATCH_LOG_EVENT_CODES.HALFTIME_END]: HalftimeEndEventCard,
  [MATCH_LOG_EVENT_CODES.STOPPAGE_START]: StoppageStartEventCard,
  [MATCH_LOG_EVENT_CODES.STOPPAGE_END]: StoppageEndEventCard,
  [MATCH_LOG_EVENT_CODES.MATCH_START]: MatchStartEventCard,
  [MATCH_LOG_EVENT_CODES.MATCH_END]: MatchEndEventCard,
};

// Picks the card for a log entry by its event code. Shared by the scorekeeper
// console and the overlay control room so both render a match log identically.
// Blocks are matched loosely (code or description) because older match_events
// rows don't all carry the "block" code.
export function MatchLogEventCard({ log, ...props }) {
  const normalizedEventCode = `${log.eventCode || ""}`.toLowerCase();
  const normalizedEventDescription = `${log.eventDescription || ""}`.toLowerCase();
  const isBlockLog =
    normalizedEventCode.includes(MATCH_LOG_EVENT_CODES.BLOCK) ||
    normalizedEventDescription.includes(MATCH_LOG_EVENT_CODES.BLOCK);
  const CardComponent = isBlockLog
    ? BlockEventCard
    : CARD_BY_EVENT_CODE[normalizedEventCode] || UnknownEventCard;
  return <CardComponent log={log} {...props} />;
}
