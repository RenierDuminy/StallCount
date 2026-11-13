// Per-page search metadata. SeoManager sets a generic title per route
// ("Event | StallCount"); a page that knows what it shows (an event's name,
// a match's teams) hands the real title, description and structured data here
// once its data has loaded, and SeoManager applies it. Keyed by pathname, so
// a page that is leaving can never label the next one.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const overrides = new Map();
const listeners = new Set();

export const SITE_NAME = "StallCount";

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPageMetaOverride(pathname) {
  return overrides.get(pathname) || null;
}

export function subscribePageMeta(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "CTFDA MX League 2026" -> "CTFDA MX League 2026 | StallCount". */
export function withSiteName(title) {
  const value = `${title ?? ""}`.trim();
  return value ? `${value} | ${SITE_NAME}` : SITE_NAME;
}

/**
 * Give the current page its own search title and description, and optionally
 * schema.org structured data (`structuredData`, one object or a list). Pass
 * `null` until the page's data has loaded; the route's generic title shows
 * meanwhile.
 */
export function usePageMeta(meta) {
  const { pathname } = useLocation();
  const title = meta?.title || "";
  const description = meta?.description || "";
  const structuredData = meta?.structuredData ? JSON.stringify(meta.structuredData) : "";

  useEffect(() => {
    if (!title) return undefined;
    overrides.set(pathname, {
      title,
      description,
      structuredData: structuredData ? JSON.parse(structuredData) : null,
    });
    emit();
    return () => {
      overrides.delete(pathname);
      emit();
    };
  }, [pathname, title, description, structuredData]);
}

/** "2026-03-07" -> "7 Mar 2026"; a range shares the year. */
export function formatSearchDateRange(startDate, endDate) {
  const parse = (value) => {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const start = parse(startDate);
  const end = parse(endDate);
  const fmt = (date, withYear) =>
    date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  if (start && end && start.getTime() !== end.getTime()) {
    return `${fmt(start, start.getFullYear() !== end.getFullYear())} – ${fmt(end, true)}`;
  }
  if (start || end) return fmt(start || end, true);
  return "";
}
