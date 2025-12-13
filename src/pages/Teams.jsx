import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams } from "../services/teamService";
import { Card, Panel, SectionHeader, SectionShell, Field, Input } from "../components/ui/primitives";

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadTeams() {
      try {
        setLoading(true);
        const data = await getAllTeams();
        if (!ignore) {
          setTeams(data);
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
  }, []);

  const filteredTeams = useMemo(() => {
    if (!query.trim()) {
      return teams;
    }
    const q = query.toLowerCase();
    return teams.filter((team) => {
      return (
        team.name?.toLowerCase().includes(q) ||
        team.short_name?.toLowerCase().includes(q)
      );
    });
  }, [teams, query]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-4 sm:py-5">
        <Card className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            eyebrow="Teams"
            title="Registered teams"
            description="Registered teams across all tournaments and leagues."
          />
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-4 sm:space-y-6">
        <Card className="space-y-4 p-6">
          <SectionHeader
            eyebrow="Teams list"
            description={loading ? "Refreshing enrollment..." : `${filteredTeams.length} of ${teams.length} clubs visible`}
            action={
              <Field className="w-full max-w-xs" label="Search teams" htmlFor="teams-search">
                <Input
                  id="teams-search"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by team or short code"
                />
              </Field>
            }
          />

          {error && (
            <Card variant="muted" className="border border-rose-400/40 bg-rose-950/30 p-4 text-sm font-semibold text-rose-100">
              {error}
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading && teams.length === 0 ? (
              Array.from({ length: 6 }).map((_, index) => (
                <Panel key={index} variant="muted" className="animate-pulse p-5">
                  <div className="h-4 w-1/2 rounded-full bg-white/40" />
                  <div className="mt-2 h-3 w-1/3 rounded-full bg-white/30" />
                </Panel>
              ))
            ) : filteredTeams.length === 0 ? (
              <Card variant="muted" className="col-span-full p-6 text-center text-sm text-ink-muted">
                No teams match your search.
              </Card>
            ) : (
              filteredTeams.map((team) => (
                <Panel
                  key={team.id}
                  as={Link}
                  to={`/teams/${team.id}`}
                  variant="tinted"
                  className="p-4 shadow-md transition hover:-translate-y-0.5 hover:shadow-strong"
                >
                  <h3 className="text-lg font-semibold text-ink sm:text-xl">{team.name}</h3>
                  {team.short_name && <p className="text-xs text-ink-muted sm:text-sm">{team.short_name}</p>}
                </Panel>
              ))
            )}
          </div>
        </Card>
      </SectionShell>
    </div>
  );
}
