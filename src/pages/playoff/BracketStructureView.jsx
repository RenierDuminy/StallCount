import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  formatSourceLabel,
  getNodeDisplayName,
  groupNodesByRound,
  roundColumnLabel,
} from "./bracketFormat";

// A node can carry a linked match long before the teams that will play it are
// known -- the fixture is scheduled, but both slots are still resolving from
// upstream results. Rendering a match card there gives "TBD vs TBD", which says
// less than the placeholder's "Winner of QF1 / Winner of QF2". So the match card
// is only used once at least one real team is attached.
function hasAssignedTeams(match) {
  return Boolean(match?.team_a?.id || match?.team_b?.id);
}

// Read-only bracket view for public event workspaces.
//
// This is a deliberate fork of the admin BracketCanvas: it keeps that
// component's connector-measuring engine but drops every editor affordance
// (node selection, "add game here" slots, the trailing new-round column).
// The other difference is what a node renders as -- when a node has a linked
// match we hand off to the host page's own match card renderer so the public
// card style (live score, status, click-through) is reused verbatim; only
// unlinked nodes fall back to a source-label placeholder.
//
// Props:
//   bracket         - bracket object with `nodes` (round, position, source_a/b,
//                     advance_to_winner(_side), advance_to_loser(_side), match).
//   lookups         - { divisionById, poolById, teamById, nodeById } for labels.
//   renderMatchCard - (match, { title }) => ReactNode, supplied by the host page.
//   emptyMessage    - copy shown when the bracket has no nodes.

// Two column widths rather than one. A round showing real match cards needs the
// full width -- StandardEventMatchCard has no intrinsic size and simply fills
// its container, so this is what actually sizes it. A round made up entirely of
// placeholders ("Winner of Quarterfinal 1") needs far less, and stretching those
// to match-card width left whole rounds as mostly whitespace.
//
// Sized in em so it tracks --sc-bracket-scale (see .sc-bracket-scroll): the
// bracket shrinks as a whole on small screens instead of just the text.
const COLUMN_WIDTH_CLASS = "w-[17em]";

// Placeholder columns are measured rather than given a fixed width. Source
// labels are built from database node names ("Winner of {name}"), so their
// length is not knowable here -- any hardcoded width is a guess that wraps the
// moment a bracket uses longer names.
//
// Per-column max-content would size each column independently, leaving every
// placeholder column a slightly different width. Instead each card is measured
// at its natural width, and the widest across the whole bracket sets a single
// width for all of them. Until that measurement lands, max-content keeps the
// cards unwrapped so the measured value is the true unwrapped width.
const PLACEHOLDER_COLUMN_WIDTH_CLASS = "w-max";
// Ceiling for the measured width: past a full match card, wrapping is the right
// outcome rather than a column that runs away.
const PLACEHOLDER_MAX_WIDTH_CLASS = "max-w-[17em]";
// Gap between round columns, also em-scaled. This is the only thing setting how
// much horizontal room the connectors have: midX in recomputeSegments splits the
// gap, so the bezier's horizontal spread is exactly this value. Narrowing it
// steepens every curve into an S-bend; widening it lets the links breathe.
const COLUMN_GAP_CLASS = "gap-[4.5em]";

// Derive a column heading from the nodes themselves. roundColumnLabel() infers
// names positionally (last column = "Final"), which is wrong for a bracket that
// also carries placement rounds -- the final column there might be a 15th-place
// playoff. When every node in a column shares a leading word ("Quarterfinal 1",
// "Quarterfinal 2" -> "Quarterfinal"), that shared prefix is the better label.
function columnHeading(column, totalRounds, index) {
  const names = (column.nodes || [])
    .map((node) => (typeof node?.name === "string" ? node.name.trim() : ""))
    .filter(Boolean);

  if (names.length === column.nodes.length && names.length > 0) {
    const firstWords = names.map((name) => name.split(/\s+/)[0]);
    const shared = firstWords.every((word) => word === firstWords[0]);
    if (shared && firstWords[0].length > 1) {
      return firstWords[0];
    }
    if (names.length === 1) {
      return names[0];
    }
  }

  return roundColumnLabel(column.round, totalRounds, index);
}

// A node with no linked match yet: show where its two participants come from.
// Border is deliberately heavier than the surrounding chrome so an unresolved
// slot reads as a real card sitting alongside the live match cards.
// Widest card in a column decides that column's width, so a column only narrows
// when every one of its nodes is a placeholder. Mirrors the render condition
// below -- if the two ever disagree, a match card gets squeezed into the narrow
// width.
function columnRendersOnlyPlaceholders(column, renderMatchCard) {
  if (!renderMatchCard) return true;
  return (column.nodes || []).every(
    (node) => !(node.match && hasAssignedTeams(node.match)),
  );
}

function NodePlaceholderCard({ node, lookups, registerPlaceholder }) {
  return (
    <div
      ref={(element) => registerPlaceholder?.(node.id, element)}
      className="rounded-xl border-2 border-dashed border-[var(--sc-border-strong)] bg-[var(--sc-surface-muted)]/70 px-[0.7em] py-[0.5em] shadow-sm"
    >
      {/* Inner wrapper stays at max-content so it always occupies the natural
          unwrapped width, even once the column has been given the shared
          measured width. whitespace-nowrap on the labels keeps that honest --
          without it the browser would report the wrapped width and the cards
          would ratchet narrower on every pass. */}
      <div className="w-max">
        <div className="mb-[0.35em]">
          <span className="text-[0.875em] font-semibold text-[var(--sc-ink)]">
            {getNodeDisplayName(node)}
          </span>
        </div>
        <p className="whitespace-nowrap text-[0.75em] leading-snug text-[var(--sc-ink-muted)]">
          <span className="text-[var(--sc-ink)]">A:</span>{" "}
          {formatSourceLabel(node.source_a, lookups)}
        </p>
        <p className="whitespace-nowrap text-[0.75em] leading-snug text-[var(--sc-ink-muted)]">
          <span className="text-[var(--sc-ink)]">B:</span>{" "}
          {formatSourceLabel(node.source_b, lookups)}
        </p>
      </div>
      <p className="mt-[0.35em] border-t border-[var(--sc-border)] pt-[0.3em] text-[0.65em] uppercase tracking-wide text-[var(--sc-ink-muted)]">
        To be confirmed
      </p>
    </div>
  );
}

export default function BracketStructureView({
  bracket,
  lookups,
  renderMatchCard,
  emptyMessage = "The playoff bracket has not been published yet.",
}) {
  const containerRef = useRef(null);
  const nodeRefs = useRef(new Map());
  // Placeholder cards are tracked separately from nodeRefs: nodeRefs holds the
  // connector anchors (every node, match card or not), while these are only the
  // text-sized cards whose natural width feeds the shared-width calculation.
  const placeholderRefs = useRef(new Map());
  const [segments, setSegments] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  // Widest placeholder in the bracket, in px. null until measured, which is the
  // pass where the cards are still at their natural max-content width.
  const [placeholderWidth, setPlaceholderWidth] = useState(null);
  // Which side(s) have more bracket scrolled out of view, for the edge fades.
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const nodes = useMemo(() => bracket?.nodes || [], [bracket]);
  const rounds = useMemo(() => groupNodesByRound(nodes), [nodes]);
  const totalRounds = rounds.length;

  const registerNode = useCallback((nodeId, element) => {
    if (!nodeId) return;
    if (element) {
      nodeRefs.current.set(nodeId, element);
    } else {
      nodeRefs.current.delete(nodeId);
    }
  }, []);

  const registerPlaceholder = useCallback((nodeId, element) => {
    if (!nodeId) return;
    if (element) {
      placeholderRefs.current.set(nodeId, element);
    } else {
      placeholderRefs.current.delete(nodeId);
    }
  }, []);

  // Find the widest placeholder and apply that width to all of them, so the
  // cards line up instead of each column sizing itself.
  //
  // The card's content sits in a max-content wrapper, so scrollWidth reports the
  // natural unwrapped content width regardless of how wide the card has been
  // made -- that is what keeps this from feeding its own output back in. Border
  // is added on because scrollWidth covers padding but not border, and the
  // width applied to the column is a border-box width.
  const recomputePlaceholderWidth = useCallback(() => {
    let widest = 0;
    placeholderRefs.current.forEach((element) => {
      if (!element) return;
      const style = window.getComputedStyle(element);
      const border =
        parseFloat(style.borderLeftWidth || 0) + parseFloat(style.borderRightWidth || 0);
      const natural = element.scrollWidth + border;
      if (natural > widest) widest = natural;
    });

    setPlaceholderWidth((previous) => {
      if (!widest) return previous;
      // Sub-pixel jitter from fractional zoom would otherwise re-render forever.
      if (previous !== null && Math.abs(previous - widest) < 1) return previous;
      return widest;
    });
  }, []);

  // Recompute connector segments from measured node rects: each runs from a
  // source node's right edge to the participant slot it feeds on its target.
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

        // Source A occupies the target's top quarter, source B the bottom
        // quarter; with no side recorded, aim at the card centre.
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

    // Both setters below bail out when nothing actually moved. Without this the
    // component feeds itself: every measurement produced a fresh array/object,
    // which never compares equal, so React re-rendered, which resized the SVG,
    // which tripped the ResizeObserver, which measured again. Cheap identity
    // checks turn that loop into a no-op once the layout settles.
    setSegments((previous) => {
      if (previous.length === nextSegments.length) {
        const unchanged = previous.every((segment, index) => {
          const next = nextSegments[index];
          return segment.key === next.key && segment.d === next.d && segment.tone === next.tone;
        });
        if (unchanged) return previous;
      }
      return nextSegments;
    });

    const width = container.scrollWidth;
    const height = container.scrollHeight;
    setCanvasSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  }, [nodes]);

  // Track how much bracket sits off either edge so the fades can be toggled.
  // The 1px tolerance absorbs sub-pixel scroll offsets at fractional zoom.
  const recomputeOverflow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const maxScroll = container.scrollWidth - container.clientWidth;
    const start = container.scrollLeft > 1;
    const end = maxScroll > 1 && container.scrollLeft < maxScroll - 1;
    // Runs on every scroll event, so only re-render when a fade actually flips.
    setOverflow((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    );
  }, []);

  // Placeholder width first: it changes card widths, which moves every connector
  // anchor, so measuring segments before it would compute against a stale layout.
  useLayoutEffect(() => {
    recomputePlaceholderWidth();
  }, [recomputePlaceholderWidth, nodes]);

  useLayoutEffect(() => {
    recomputeSegments();
    recomputeOverflow();
  }, [recomputeSegments, recomputeOverflow, placeholderWidth]);

  // Re-measure on container/window resize: covers font load, card reflow and
  // horizontal-scroll layout shifts.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    // Measuring 40 nodes forces a layout flush, so collapse bursts of resize
    // events into a single measurement per frame rather than one per event.
    let frame = 0;
    const onChange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        recomputePlaceholderWidth();
        recomputeSegments();
        recomputeOverflow();
      });
    };

    // Only the container is observed, not the 40 node elements. A card cannot
    // change size without changing the column's height or the container's scroll
    // dimensions, so the container catches the same events with one subscription
    // instead of 41.
    //
    // Observing the nodes was also unreliable: the set was captured from
    // nodeRefs at subscribe time, so cards registered later were never observed
    // and unmounted ones were never dropped.
    const observer = new ResizeObserver(onChange);
    observer.observe(container);

    container.addEventListener("scroll", recomputeOverflow, { passive: true });
    window.addEventListener("resize", onChange);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("scroll", recomputeOverflow);
      window.removeEventListener("resize", onChange);
    };
    // `nodes` is intentionally absent: recomputeSegments already closes over it
    // and changes identity with it, so listing it only forced a redundant
    // teardown/resubscribe of the observer across every node element.
  }, [recomputeSegments, recomputeOverflow, recomputePlaceholderWidth]);

  if (!nodes.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--sc-border)] bg-[var(--sc-surface)]/40 p-4 text-center text-sm text-[var(--sc-ink-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Edge fades: only shown while there is more bracket in that direction. */}
      <div
        className="sc-bracket-edge sc-bracket-edge--start"
        data-visible={overflow.start}
        aria-hidden="true"
      />
      <div
        className="sc-bracket-edge sc-bracket-edge--end"
        data-visible={overflow.end}
        aria-hidden="true"
      />

      <div ref={containerRef} className="sc-bracket-scroll relative pb-3">
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
              strokeWidth="3.5"
              strokeLinecap="round"
              stroke={
                segment.tone === "loser"
                  ? "rgba(251, 191, 36, 0.75)"
                  : "rgba(52, 211, 153, 0.8)"
              }
            />
          ))}
        </svg>

        <div className={`relative flex min-w-full items-stretch ${COLUMN_GAP_CLASS}`}>
          {rounds.map((column, columnIndex) => {
            const placeholderColumn = columnRendersOnlyPlaceholders(
              column,
              renderMatchCard,
            );
            return (
            <div
              key={column.round}
              className={`flex ${
                placeholderColumn
                  ? PLACEHOLDER_COLUMN_WIDTH_CLASS
                  : COLUMN_WIDTH_CLASS
              } ${placeholderColumn ? PLACEHOLDER_MAX_WIDTH_CLASS : ""} shrink-0 flex-col gap-[0.75em]`}
              // Once measured, every placeholder column takes the same width --
              // the widest card in the bracket. The w-max class above only
              // governs the first pass, before that measurement exists.
              style={
                placeholderColumn && placeholderWidth
                  ? { width: `${placeholderWidth}px` }
                  : undefined
              }
            >
              <div className="border-b-2 border-[var(--sc-border-strong)] pb-[0.4em]">
                <span className="text-[0.875em] font-semibold uppercase tracking-wide text-[var(--sc-ink)]">
                  {columnHeading(column, totalRounds, columnIndex)}
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-around gap-[0.6em]">
                {column.nodes.map((node) => (
                  <div
                    key={node.id}
                    ref={(element) => registerNode(node.id, element)}
                    className="relative z-10 w-full"
                  >
                    {node.match && hasAssignedTeams(node.match) && renderMatchCard ? (
                      // The shared match card is sized in rem, so it ignores
                      // this bracket's em scale. Wrap it so it shrinks in step
                      // with the placeholders on small screens.
                      //
                      // No title override: once teams are assigned this must be
                      // the same card the Week 1-7 schedule renders, which titles
                      // itself with the matchup. The node's bracket identity is
                      // already carried by the column heading above it.
                      <div className="sc-bracket-match">
                        {renderMatchCard(node.match)}
                      </div>
                    ) : (
                      <NodePlaceholderCard
                        node={node}
                        lookups={lookups}
                        registerPlaceholder={registerPlaceholder}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.7rem] text-[var(--sc-ink-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1 w-5 rounded bg-[rgba(52,211,153,0.8)]" />
          Winner advances
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1 w-5 rounded bg-[rgba(251,191,36,0.75)]" />
          Loser advances
        </span>
        {overflow.start || overflow.end ? (
          <span className="text-[var(--sc-ink-muted)]">· Scroll sideways for more</span>
        ) : null}
      </div>
    </div>
  );
}

