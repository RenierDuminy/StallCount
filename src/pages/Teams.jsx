import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getTeamsPage } from "../services/teamService";
import { Card, Panel, SectionHeader, SectionShell, Field, Input } from "../components/ui/primitives";

const TEAMS_PAGE_SIZE = 20;

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [totalTeams, setTotalTeams] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCache, setPageCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const pageCacheKey = `${normalizedQuery || "all"}:${pageIndex}`;

  useEffect(() => {
    let ignore = false;

    async function loadTeams() {
      const cachedPage = pageCache[pageCacheKey];
      if (cachedPage) {
        setTeams(cachedPage.rows);
        setTotalTeams(cachedPage.total);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setTeams([]);
        const data = await getTeamsPage({
          page: pageIndex,
          pageSize: TEAMS_PAGE_SIZE,
          search: normalizedQuery,
        });
        if (!ignore) {
          setTeams(data.rows);
          setTotalTeams(data.total);
          setPageCache((current) => ({
            ...current,
            [pageCacheKey]: data,
          }));
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load teams");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadTeams();
    return () => {
      ignore = true;
    };
  }, [normalizedQuery, pageCache, pageCacheKey, pageIndex]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(totalTeams / TEAMS_PAGE_SIZE)),
    [totalTeams],
  );
  const pageStart = totalTeams === 0 ? 0 : pageIndex * TEAMS_PAGE_SIZE + 1;
  const pageEnd = totalTeams === 0 ? 0 : pageStart + teams.length - 1;
  const canGoPrevious = pageIndex > 0 && !loading;
  const canGoNext = pageIndex + 1 < pageCount && !loading;
  const resultDescription = loading
    ? "Loading teams..."
    : totalTeams === 0
      ? "No teams visible"
      : `Showing ${pageStart}-${pageEnd} of ${totalTeams} teams`;

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4 sm:py-5">
        <SectionHeader
          eyebrow="Teams"
          title="Registered teams"
          description="Registered teams across all tournaments and leagues."
        />
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader
            eyebrow="Teams list"
            description={resultDescription}
          />
          <Field className="w-full max-w-xs" label="Search teams" htmlFor="teams-search">
            <Input
              id="teams-search"
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageIndex(0);
              }}
              placeholder="Search by team or short code"
            />
          </Field>
        </div>

        {error && (
          <Card variant="muted" className="border border-rose-400/40 bg-rose-950/30 p-4 text-sm font-semibold text-rose-100">
            {error}
          </Card>
        )}

        <div className="grid gap-2">
          {loading && teams.length === 0 ? (
            Array.from({ length: 8 }).map((_, index) => (
              <Panel key={index} variant="muted" className="animate-pulse p-4">
                <div className="h-4 w-1/2 rounded-full bg-white/40" />
                <div className="mt-2 h-3 w-1/4 rounded-full bg-white/30" />
              </Panel>
            ))
          ) : teams.length === 0 ? (
            <Card variant="muted" className="p-6 text-center text-sm text-ink-muted">
              No teams match your search.
            </Card>
          ) : (
            teams.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="flex min-w-0 items-center justify-between gap-4 border-b border-border px-1 py-3 text-ink transition hover:border-accent hover:text-accent sm:px-2"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold sm:text-lg">{team.name}</h3>
                  {team.short_name && <p className="text-xs text-ink-muted sm:text-sm">{team.short_name}</p>}
                </div>
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  View
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Page {totalTeams === 0 ? 0 : pageIndex + 1} of {totalTeams === 0 ? 0 : pageCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sc-button is-ghost"
              disabled={!canGoPrevious}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="sc-button is-ghost"
              disabled={!canGoNext}
              onClick={() => setPageIndex((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </SectionShell>
    </div>
  );
}
