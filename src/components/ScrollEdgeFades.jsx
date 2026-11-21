import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A horizontal scroller with the bracket view's edge fades: a fade and a thin
 * glowing rule on a side only while there is more content scrolled off that
 * side. Same look as the playoff bracket (.sc-bracket-edge in theme.css).
 * The scroller also takes the bracket's scrollbar styling (.sc-edge-scroll).
 */
export default function ScrollEdgeFades({ children, className = "" }) {
  const scrollRef = useRef(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = maxScroll > 1 && el.scrollLeft < maxScroll - 1;
    setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useLayoutEffect(() => {
    recompute();
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    window.addEventListener("resize", recompute);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [recompute]);

  return (
    <div className="relative">
      <div className="sc-bracket-edge sc-bracket-edge--start" data-visible={overflow.start} aria-hidden="true" />
      <div className="sc-bracket-edge sc-bracket-edge--end" data-visible={overflow.end} aria-hidden="true" />
      <div ref={scrollRef} onScroll={recompute} className={`sc-edge-scroll overflow-x-auto pb-3 ${className}`}>
        {children}
      </div>
    </div>
  );
}
