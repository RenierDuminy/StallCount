import { formatPlayerLabel, sortPlayersByName } from "../../utils/playerList";

// Scrimmage rosters are typed on the setup page as text.

/** One player per line: "Emma Belcher #7", "7 Emma Belcher" or just a name. */
export function parseRosterText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const trailing = line.match(/^(.*?)\s*#\s*(\d{1,3})$/);
      if (trailing && trailing[1]) return { name: trailing[1].trim(), jersey_number: Number(trailing[2]) };
      const leading = line.match(/^#?(\d{1,3})\s+(.+)$/);
      if (leading) return { name: leading[2].trim(), jersey_number: Number(leading[1]) };
      return { name: line, jersey_number: null };
    });
}

/** The stored roster as editable text, alphabetical, "Name #7". */
export function rosterToText(players) {
  return sortPlayersByName(players || [])
    .map((player) => formatPlayerLabel(player))
    .join("\n");
}
