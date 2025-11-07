import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllPlayers } from "../services/playerService";

const PREFERRED_FIELD_ORDER = [
  "team",
  "team_name",
  "team_id",
  "number",
  "jersey_number",
  "first_name",
  "last_name",
  "full_name",
  "nickname",
  "position",
  "role",
  "email",
  "phone",
  "status",
  "availability",
];

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "inserted_at"]);

export default function CaptainPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const data = await getAllPlayers();
        if (isMounted) {
          setPlayers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Unable to load players");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();
    const interval = setInterval(load, 60_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const columns = useMemo(() => {
    if (players.length === 0) return [];

    const values = new Set();
    players.forEach((player) => {
      Object.keys(player || {}).forEach((key) => {
        if (!HIDDEN_FIELDS.has(key)) {
          values.add(key);
        }
      });
    });

    const asArray = Array.from(values);
    return asArray.sort((a, b) => {
      const indexA = PREFERRED_FIELD_ORDER.indexOf(a);
      const indexB = PREFERRED_FIELD_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) {
        return a.localeCompare(b);
      }
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [players]);

  const teams = useMemo(() => {
    const grouped = new Map();
    players.forEach((player) => {
      const teamName =
        player?.team ||
        player?.team_name ||
        player?.teamName ||
        player?.squad ||
        "Unassigned";

      if (!grouped.has(teamName)) {
        grouped.set(teamName, []);
      }
      grouped.get(teamName).push(player);
    });

    return Array.from(grouped.entries()).sort(([teamA], [teamB]) =>
      teamA.localeCompare(teamB)
    );
  }, [players]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Backend workspace
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Captain workspace
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Review rosters, coordinate availability, and keep your squad aligned before
              first pull.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Back to admin hub
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Team rosters</h2>
              <p className="mt-1 text-sm text-slate-600">
                Listing sourced directly from the Supabase `players` table. Refreshes every
                minute so late edits are captured in the field.
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              {loading ? "Updating…" : `Total players: ${players.length}`}
              {error && (
                <p className="mt-1 text-rose-500">Error loading data: {error}</p>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {loading && players.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="h-3 w-3 animate-ping rounded-full bg-brand-light" />
                  Fetching players from Supabase…
                </div>
              </div>
            ) : teams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                No players were returned from Supabase. Add records to the `players` table to
                populate this view.
              </div>
            ) : (
              teams.map(([teamName, roster]) => (
                <section
                  key={teamName}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-inner"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        {teamName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Players: {roster.length.toString().padStart(2, "0")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-100/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          {columns.map((column) => (
                            <th key={column} className="px-4 py-3">
                              {prettifyHeading(column)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {roster.map((player, index) => {
                          const rowKey =
                            player.id ||
                            player.uuid ||
                            player.player_id ||
                            player.email ||
                            player.full_name ||
                            `${teamName}-${index}`;

                          return (
                            <tr key={rowKey}>
                              {columns.map((column) => (
                                <td key={column} className="px-4 py-3 align-top">
                                  {formatCell(player[column])}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function prettifyHeading(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : <span className="text-slate-400">—</span>;
  }

  if (typeof value === "object") {
    return (
      <code className="text-xs text-slate-500">
        {JSON.stringify(value, null, 2)}
      </code>
    );
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return value;
  }

  return value;
}
