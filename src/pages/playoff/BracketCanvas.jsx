import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chip } from "../../components/ui/primitives";
import {
  formatMatchStatus,
  formatMatchup,
  formatSourceLabel,
  getNodeDisplayName,
  groupNodesByRound,
  roundColumnLabel,
} from "./bracketFormat";

// Interactive visual bracket. Renders the selected bracket's nodes as round
// columns (left -> right) and draws SVG connector lines from each node to its
// winner/loser advancement targets. Clicking a node selects it for editing;
// clicking an empty "Add game here" slot asks the page to start a new node
// pre-placed in that column.
//
// Props:
//   bracket        - a bracket object with `nodes` (each carrying round,
//                    position, source_a/b, advance_to_winner(_side),
//                    advance_to_loser(_side), match).
//   lookups        - source-label lookups { divisionById, poolById, teamById, nodeById }.
//   selectedNodeId - id of the currently selected node (highlighted).
//   onSelectNode   - (nodeId) => void, called when a node card is clicked.
//   onAddInColumn  - (roundValue) => void, called from an "Add game here" slot.
export default function BracketCanvas({
  bracket,
  lookups,
  selectedNodeId,
  onSelectNode,
  onAddInColumn,
}) {
  const containerRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const [segments, setSegments] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const nodes = useMemo(() => bracket?.nodes || [], [bracket]);
  const rounds = useMemo(() => groupNodesByRound(nodes), [nodes]);
  const totalRounds = rounds.length;

  // Register/unregister a node card's DOM element for measurement.
  const registerNode = useCallback((nodeId, element) => {
    if (!nodeId) return;
    if (element) {
      nodeRefs.current.set(nodeId, element);
    } else {
      nodeRefs.current.delete(nodeId);
    }
  }, []);

  // Recompute connector line segments from the measured node rects. A segment
  // runs from a source node's right edge to its target node's left edge.
  const recomputeSegments = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      setSegments([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const nextSegments = [];

    const rectFor = (nodeId) => {
      const element = nodeRefs.current.get(nodeId);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - containerRect.left + container.scrollLeft,
        right: rect.right - containerRect.left + container.scrollLeft,
        top: rect.top - containerRect.top + container.scrollTop,
        bottom: rect.bottom - containerRect.top + container.scrollTop,
      };
    };

    for (const node of nodes) {
      const from = rectFor(node.id);
      if (!from) continue;

      const links = [
        {
          targetId: node.advance_to_winner,
          tone: "winner",
          side: node.advance_to_winner_side,
        },
        {
          targetId: node.advance_to_loser,
          tone: "loser",
          side: node.advance_to_loser_side,
        },
      ];

      for (const link of links) {
        if (!link.targetId) continue;
        const to = rectFor(link.targetId);
        if (!to) continue;

        // Attach to the target's participant slot: source A sits in the top
        // quarter, source B in the bottom quarter. With no side recorded, fall
        // back to the card centre.
        const side = String(link.side || "").toUpperCase();
        const height = to.bottom - to.top;
        let y2 = (to.top + to.bottom) / 2;
        if (side === "A") {
          y2 = to.top + height * 0.25;
        } else if (side === "B") {
          y2 = to.top + height * 0.75;
        }

        const x1 = from.right;
        const y1 = (from.top + from.bottom) / 2;
        const x2 = to.left;
        const midX = x1 + (x2 - x1) / 2;

        nextSegments.push({
          key: `${node.id}-${link.tone}`,
          tone: link.tone,
          d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        });
      }
    }

    setSegments(nextSegments);
    setCanvasSize({
      width: container.scrollWidth,
      height: container.scrollHeight,
    });
  }, [nodes]);

  // Measure after layout and whenever nodes change.
  useLayoutEffect(() => {
    recomputeSegments();
  }, [recomputeSegments]);

  // Re-measure on container resize and window resize (covers font load, wrap,
  // and horizontal-scroll layout shifts).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => recomputeSegments());
    observer.observe(container);
    nodeRefs.current.forEach((element) => observer.observe(element));

    const onWindowResize = () => recomputeSegments();
    window.addEventListener("resize", onWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [recomputeSegments, nodes]);

  if (!nodes.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 bg-surface/40 p-3 text-center text-sm text-ink-muted">
        No games in this bracket yet. Add a game to start building the visual bracket.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative overflow-x-auto pb-1">
      {/* Connector overlay sits behind the node cards. */}
      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={canvasSize.width || "100%"}
        height={canvasSize.height || "100%"}
        aria-hidden="true"
      >
        {segments.map((segment) => (
          <path
            key={segment.key}
            d={segment.d}
            fill="none"
            strokeWidth="2"
            stroke={segment.tone === "loser" ? "rgba(251, 191, 36, 0.55)" : "rgba(52, 211, 153, 0.6)"}
          />
        ))}
      </svg>

      <div className="relative flex min-w-full items-stretch gap-16">
        {rounds.map((column, columnIndex) => (
          <div key={column.round} className="flex w-[10rem] shrink-0 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-1 border-b border-border pb-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink">
                {roundColumnLabel(column.round, totalRounds, columnIndex)}
              </span>
              <span className="text-[0.65rem] text-ink-muted">
                {column.nodes.length} game{column.nodes.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-around gap-2">
              {column.nodes.map((node) => {
                const selected = node.id === selectedNodeId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    ref={(element) => registerNode(node.id, element)}
                    onClick={() => onSelectNode?.(node.id)}
                    className={`relative z-10 w-full rounded-xl border px-3 py-2 text-left transition ${
                      selected
                        ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.12)]"
                        : "border-white/20 bg-surface/80 hover:border-emerald-400/40"
                    }`}
                  >
                    <div className="mb-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-sm font-semibold text-ink">
                        {getNodeDisplayName(node)}
                      </span>
                      <span className="text-[0.65rem] text-ink-muted">Pos {node.position ?? "--"}</span>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {formatSourceLabel(node.source_a, lookups)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatSourceLabel(node.source_b, lookups)}
                    </p>
                    <p className="mt-0.5 text-[0.7rem] text-ink-muted">
                      {node.match ? (
                        <>
                          {formatMatchup(node.match)} · {formatMatchStatus(node.match.status)}
                        </>
                      ) : (
                        <span className="text-amber-200/80">No linked match</span>
                      )}
                    </p>
                  </button>
                );
              })}

              {onAddInColumn ? (
                <button
                  type="button"
                  onClick={() => onAddInColumn(column.round)}
                  className="relative z-10 w-full rounded-xl border border-dashed border-white/20 bg-surface/30 px-1.5 py-1 text-center text-xs text-ink-muted transition hover:border-emerald-400/40 hover:text-ink"
                >
                  + Add game here
                </button>
              ) : null}
            </div>
          </div>
        ))}

        {/* Trailing column to seed a brand-new round beyond the last one. */}
        {onAddInColumn ? (
          <div className="flex w-[10rem] shrink-0 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-1 border-b border-transparent pb-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                New round
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-around">
              <button
                type="button"
                onClick={() => onAddInColumn(totalRounds + 1)}
                className="relative z-10 w-full rounded-xl border border-dashed border-white/20 bg-surface/30 px-1.5 py-1 text-center text-xs text-ink-muted transition hover:border-emerald-400/40 hover:text-ink"
              >
                + Add game here
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-5 rounded bg-[rgba(52,211,153,0.7)]" />
          Winner advances
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-5 rounded bg-[rgba(251,191,36,0.7)]" />
          Loser advances
        </span>
      </div>
    </div>
  );
}
