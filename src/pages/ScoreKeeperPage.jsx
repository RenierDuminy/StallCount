import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import scorekeeperHtml from "../scorekeeper/index.html?raw";
import rawScorekeeperCss from "../scorekeeper/scorekeeper.css?raw";

const SCOREKEEPER_BODY = stripScripts(extractBody(scorekeeperHtml));
const SCOREKEEPER_MARKUP = `<div id="scorekeeper-app" data-scorekeeper-root>${SCOREKEEPER_BODY}</div>`;
const SCOREKEEPER_STYLES = scopeCss(rawScorekeeperCss);

export default function ScoreKeeperPage() {
  const shellRef = useRef(null);
  const [status, setStatus] = useState("idle");

  const markup = useMemo(() => SCOREKEEPER_MARKUP, []);
  const scopedStyles = useMemo(() => SCOREKEEPER_STYLES, []);

  useEffect(() => {
    const host = shellRef.current;
    if (!host) return undefined;

    setStatus("loading");

    const styleTag = document.createElement("style");
    styleTag.setAttribute("data-scorekeeper-style", "true");
    styleTag.innerHTML = scopedStyles;
    document.head.append(styleTag);

    host.innerHTML = markup;

    let cancelled = false;
    let destroyRef = null;

    (async () => {
      try {
        const module = await import("../scorekeeper/scorekeeper");
        if (cancelled) return;

        destroyRef = module.destroyScorekeeper;
        await module.bootstrapScorekeeper();
        if (!cancelled) setStatus("ready");
      } catch (error) {
        console.error("Failed to initialise scorekeeper:", error);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (destroyRef) {
        destroyRef();
      }
      host.innerHTML = "";
      styleTag.remove();
    };
  }, [markup, scopedStyles]);

  const isLoading = status === "loading" || status === "idle";
  const isError = status === "error";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Backend workspace
            </p>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">
              Score keeper console
            </h1>
            <p className="text-sm text-slate-300 md:max-w-xl">
              Legacy Maties logic ported into the StallCount PWA shell. Optimised
              for smartphones while keeping the officiating workflow intact.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/captain"
              className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Open Captain hub
            </Link>
            <Link
              to="/admin"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Back to admin hub
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 pb-12 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 shadow-[0_35px_60px_-45px_rgba(15,118,110,0.65)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-white md:text-lg">
                Live field console
              </h2>
              <p className="text-xs text-slate-400 md:text-sm">
                Built for quick thumb input. Rotate to landscape for table
                oversight.
              </p>
            </div>
            {isLoading && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Initialising...
              </span>
            )}
            {isError && (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 px-3 py-1 text-xs font-semibold text-rose-200">
                <span className="h-2 w-2 animate-ping rounded-full bg-rose-400" />
                Failed to load
              </span>
            )}
          </div>
          <div className="relative min-h-[560px] w-full">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-3xl bg-slate-950/70 backdrop-blur-sm">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="text-sm text-slate-300">
                  Loading scorekeeper interface...
                </p>
              </div>
            )}
            <div
              ref={shellRef}
              className="scorekeeper-shell min-h-[560px] overflow-hidden rounded-3xl bg-slate-100 text-slate-900 shadow-inner"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/50 px-5 py-5 text-sm text-slate-300 md:text-base">
          <h3 className="text-base font-semibold text-white md:text-lg">
            Field workflow tips
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
            <li>
              Add the StallCount PWA to your home screen for one-tap access during
              tournaments.
            </li>
            <li>
              ABBA tracking, timeouts, and stoppage controls mirror the legacy
              desktop workflow, so crews can switch devices without retraining.
            </li>
            <li>
              Offline capture continues to log scores locally; reconnect to sync
              with Supabase once connectivity returns.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").trim();
}

function scopeCss(css) {
  const replaced = css
    .replace(/:root/g, "#scorekeeper-app")
    .replace(/\bbody\b/g, "#scorekeeper-app");

  return replaced.replace(
    /(^|\})\s*([^@}{][^{]*)\{/g,
    (match, prefix, selector) => {
      const scopedSelector = selector
        .split(",")
        .map((segment) => {
          const trimmed = segment.trim();
          if (
            !trimmed ||
            trimmed.startsWith("#scorekeeper-app") ||
            trimmed.startsWith("@")
          ) {
            return trimmed;
          }
          return `#scorekeeper-app ${trimmed}`;
        })
        .join(", ");

      return `${prefix} ${scopedSelector} {`;
    }
  );
}
