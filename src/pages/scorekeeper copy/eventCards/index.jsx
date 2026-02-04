import {
  MatchEventCard,
  ScoreEventCard as ScoreMatchEventCard,
  CalahanEventCard as CalahanMatchEventCard,
  BlockEventCard as BlockMatchEventCard,
  TurnoverEventCard as TurnoverMatchEventCard,
} from "./MatchEventCard";

export { BlockMatchEventCard as BlockEventCard, TurnoverMatchEventCard as TurnoverEventCard };

export function ScoreEventCard(props) {
  return <ScoreMatchEventCard {...props} />;
}

export function CalahanEventCard(props) {
  return <CalahanMatchEventCard {...props} />;
}

export function TimeoutStartEventCard(props) {
  return <MatchEventCard {...props} editLocation="bottom-right" />;
}

export function TimeoutEndEventCard(props) {
  return <MatchEventCard {...props} editLocation="bottom-right" />;
}

export function HalftimeStartEventCard(props) {
  return (
    <MatchEventCard
      {...props}
      editLocation="middle-right"
      variantOverrides={{ align: "text-center", bg: "bg-[#0f5132]", border: "border-[#0a3b24]", label: "text-white" }}
    />
  );
}

export function HalftimeEndEventCard(props) {
  return (
    <MatchEventCard
      {...props}
      editLocation="middle-right"
      variantOverrides={{ align: "text-center", bg: "bg-[#0f5132]", border: "border-[#0a3b24]", label: "text-white" }}
    />
  );
}

export function StoppageStartEventCard(props) {
  return (
    <MatchEventCard
      {...props}
      editLocation="middle-right"
      variantOverrides={{ align: "text-center", bg: "bg-[#fee2e2]", border: "border-[#ef4444]" }}
    />
  );
}

export function StoppageEndEventCard(props) {
  return (
    <MatchEventCard
      {...props}
      editLocation="middle-right"
      variantOverrides={{ align: "text-center", bg: "bg-[#fee2e2]", border: "border-[#ef4444]" }}
    />
  );
}

export function MatchStartEventCard(props) {
  return <MatchEventCard {...props} editLocation="none" />;
}

export function MatchEndEventCard(props) {
  return <MatchEventCard {...props} editLocation="none" />;
}

export function UnknownEventCard(props) {
  return <MatchEventCard {...props} editLocation="middle-right" />;
}
