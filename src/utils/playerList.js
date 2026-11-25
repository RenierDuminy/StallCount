/**
 * The house way to list players (as on Player statistics): alphabetical by
 * name, with the jersey number after it ("Emma Belcher #7"). Use these for any
 * list or picker of players. Players without a number sort with the rest by
 * name and show no "#".
 */

const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const jerseyOf = (player) => {
  const raw = player?.jersey_number ?? player?.jerseyNumber;
  if (raw === null || raw === undefined || raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};

const nameOf = (player) => String(player?.name ?? player?.playerName ?? "").trim();

/** Comparator: name (case and accent insensitive), then jersey number. */
export function comparePlayersByName(a, b) {
  const byName = nameCollator.compare(nameOf(a), nameOf(b));
  if (byName !== 0) return byName;
  const jerseyA = jerseyOf(a);
  const jerseyB = jerseyOf(b);
  if (jerseyA === jerseyB) return 0;
  if (jerseyA === null) return 1;
  if (jerseyB === null) return -1;
  return jerseyA - jerseyB;
}

/** A sorted copy; the input is not changed. */
export function sortPlayersByName(list = []) {
  return [...(list || [])].sort(comparePlayersByName);
}

/** "Name #7", or just "Name" without a number. */
export function formatPlayerLabel(player, { fallback = "Unnamed" } = {}) {
  const name = nameOf(player) || fallback;
  const jersey = jerseyOf(player);
  return jersey === null ? name : `${name} #${jersey}`;
}
