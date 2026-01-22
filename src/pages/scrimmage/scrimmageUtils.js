export function deriveShortName(name = "") {
  if (!name) return "???";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  const base = initials || name.slice(0, 3);
  return base.slice(0, 3).toUpperCase();
}

export function formatClock(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? totalSeconds : 0;
  const sign = safeSeconds < 0 ? "-" : "";
  const absolute = Math.abs(safeSeconds);
  const minutes = Math.floor(absolute / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (absolute % 60).toString().padStart(2, "0");
  return `${sign}${minutes}:${seconds}`;
}

export function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Start time pending";
  }
  return `${date.toLocaleDateString()} @ ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function toDateTimeLocal(value) {
  const fallback = new Date();
  let date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) {
    date = fallback;
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatMatchLabel(match) {
  if (!match) return "Match TBD";
  const teamA = match.team_a?.short_name || match.team_a?.name || "Team A";
  const teamB = match.team_b?.short_name || match.team_b?.name || "Team B";
  let kickoff = "Time TBD";
  if (match.start_time) {
    const kickoffDate = new Date(match.start_time);
    if (!Number.isNaN(kickoffDate.getTime())) {
      kickoff = kickoffDate.toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return `${kickoff} - ${teamA} vs ${teamB}`;
}

export function sortRoster(list = []) {
  return [...list].sort((a, b) => {
    const jerseyA = typeof a?.jersey_number === "number" ? a.jersey_number : Number.MAX_SAFE_INTEGER;
    const jerseyB = typeof b?.jersey_number === "number" ? b.jersey_number : Number.MAX_SAFE_INTEGER;
    if (jerseyA !== jerseyB) {
      return jerseyA - jerseyB;
    }
    return (a?.name || "").localeCompare(b?.name || "");
  });
}
