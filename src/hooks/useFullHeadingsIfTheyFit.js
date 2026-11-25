import { useLayoutEffect, useRef, useState } from "react";

// Whether a table's column headings fit as full words. Put the returned ref on
// the table's scroll box (the element with overflow-x-auto). Measured, not
// guessed from a breakpoint: full words are tried first and dropped to
// abbreviations only when the table would scroll sideways; they come back once
// the box is as wide as the full-word table needed. A change to the rows
// (`contentKey`) tries again.
export function useFullHeadingsIfTheyFit(contentKey) {
  const ref = useRef(null);
  const [full, setFull] = useState(true);
  const neededWidthRef = useRef(0);
  const lastKeyRef = useRef(contentKey);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (lastKeyRef.current !== contentKey) {
      lastKeyRef.current = contentKey;
      neededWidthRef.current = 0;
    }
    const check = () => {
      if (full) {
        if (element.scrollWidth > element.clientWidth + 1) {
          neededWidthRef.current = element.scrollWidth;
          setFull(false);
        }
      } else if (element.clientWidth >= neededWidthRef.current) {
        setFull(true);
      }
    };
    check();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [full, contentKey]);

  return [ref, full];
}
