import { memo } from "react";
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
