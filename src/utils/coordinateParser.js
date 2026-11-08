// Parses pasted venue coordinates into WGS84 decimal degrees.
//
// Accepted: decimal degrees ("-33.9321, 18.8602"), degrees-minutes-seconds
// ("33°55'55.6\"S 18°51'36.7\"E"), degrees + decimal minutes
// ("S 33° 55.926' E 18° 51.612'"), and Google / Apple / OpenStreetMap links
// that carry the coordinates in the URL.
//
// Not accepted (returns an error instead of guessing): UTM / South African Lo
// grid, plus codes, short links (maps.app.goo.gl) and plain addresses. The
// datum is always assumed to be WGS84, which is what phones and web maps use.
//
// Result: { lat, lng, format, warnings: string[] } or { error: string }.

const round = (value) => Math.round(value * 1e6) / 1e6;

function fromUrl(text) {
  if (!/^https?:\/\/|^www\.|maps\./i.test(text)) return null;
  if (/goo\.gl|maps\.app/i.test(text)) {
    return {
      error:
        "Short map links can't be read. Open the link, then copy the full URL from the address bar, or copy the coordinates themselves.",
    };
  }
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // keep raw text
  }
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // Google place pin (most precise)
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // Google map view
    /[?&](?:q|query|ll|sll|daddr|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/, // OpenStreetMap
    /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/, // OpenStreetMap
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      return { lat: Number(match[1]), lng: Number(match[2]), format: "Map link" };
    }
  }
  return {
    error:
      "No coordinates found in this link. Drop a pin on the map and copy the coordinates instead.",
  };
}

// One DMS / DDM / decimal component, e.g. `33°55'55.6"S` or `S 33 55.926`.
const COMPONENT =
  /([NSEW])?\s*(\d+(?:[.,]\d+)?)\s*(?:°|º|˚|deg|d|\s)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:'|′|’|m|min|\s)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|”|''|s|sec)?)?)?\s*([NSEW])?/gi;

function fromSexagesimal(text) {
  if (!/[°º˚'′’"″”]|\bdeg\b|\d\s*[NSEW]\b|\b[NSEW]\s*\d/i.test(text)) return null;
  const normalised = text.toUpperCase().replace(/[;,](?!\d)/g, " ");
  // With leading letters ("S 33 55.9 E 18 51.6") a trailing letter belongs to
  // the next value, so drop the trailing-letter group.
  const pattern = /^\s*[NSEW]/.test(normalised)
    ? new RegExp(COMPONENT.source.replace(/\\s\*\(\[NSEW\]\)\?$/, ""), "gi")
    : COMPONENT;
  const parts = [];
  for (const match of normalised.matchAll(pattern)) {
    if (!match[2]) continue;
    const toNum = (value) => (value ? Number(value.replace(",", ".")) : 0);
    const degrees = toNum(match[2]);
    const minutes = toNum(match[3]);
    const seconds = toNum(match[4]);
    if (minutes >= 60 || seconds >= 60) {
      return { error: "Minutes and seconds must be below 60." };
    }
    const hemisphere = match[1] || match[5] || null;
    parts.push({ value: degrees + minutes / 60 + seconds / 3600, hemisphere, hasSeconds: !!match[4] });
    if (parts.length === 2) break;
  }
  if (parts.length !== 2) return null;

  let [first, second] = parts;
  // Hemisphere letters fix the order even if longitude was written first.
  if (/[EW]/.test(first.hemisphere || "") || /[NS]/.test(second.hemisphere || "")) {
    [first, second] = [second, first];
  }
  const warnings = [];
  const sign = (part, negative, positive) => {
    if (part.hemisphere === negative) return -part.value;
    if (part.hemisphere === positive) return part.value;
    warnings.push("No N/S/E/W letter on one value, so it was read as north/east (positive).");
    return part.value;
  };
  return {
    lat: sign(first, "S", "N"),
    lng: sign(second, "W", "E"),
    format: first.hasSeconds || second.hasSeconds ? "Degrees, minutes, seconds" : "Degrees and decimal minutes",
    warnings,
  };
}

function fromDecimal(text) {
  const match = text.match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
  if (!match) {
    // European style "-33,9321 18,8602" (decimal commas, space separated).
    const euro = text.match(/^(-?\d+,\d+)\s+(-?\d+,\d+)$/);
    if (!euro) return null;
    return {
      lat: Number(euro[1].replace(",", ".")),
      lng: Number(euro[2].replace(",", ".")),
      format: "Decimal degrees",
    };
  }
  return { lat: Number(match[1]), lng: Number(match[2]), format: "Decimal degrees" };
}

function looksLikeUnsupported(text) {
  if (/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}/i.test(text)) {
    return "Plus codes aren't supported. Open the code in Google Maps and copy the decimal coordinates.";
  }
  if (/^\d{1,2}\s*[C-HJ-NP-X]\b/i.test(text) || /\b(utm|lo\s?\d{2})\b/i.test(text)) {
    return "UTM and Lo-grid coordinates aren't supported. Convert them to latitude/longitude first.";
  }
  const numbers = text.match(/-?\d+(?:\.\d+)?/g) || [];
  if (numbers.length >= 2 && numbers.every((n) => Math.abs(Number(n)) > 1000)) {
    return "These look like grid coordinates (metres), not degrees. Convert them to latitude/longitude first.";
  }
  return null;
}

export function parseCoordinates(input) {
  const text = String(input || "").trim();
  if (!text) return { error: "Paste coordinates or a map link." };

  const unsupported = looksLikeUnsupported(text);
  if (unsupported) return { error: unsupported };

  const result = fromUrl(text) || fromSexagesimal(text) || fromDecimal(text);
  if (!result) {
    return { error: "Couldn't read these coordinates. Use latitude first, e.g. -33.9321, 18.8602." };
  }
  if (result.error) return result;

  let { lat, lng } = result;
  const warnings = [...(result.warnings || [])];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Couldn't read these coordinates." };
  }
  // Swapped order is only certain when the "latitude" is out of range.
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    [lat, lng] = [lng, lat];
    warnings.push("The values looked swapped (latitude can't exceed 90°), so they were reversed.");
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Out of range: latitude must be within ±90 and longitude within ±180." };
  }
  // Southern-Africa sanity check: most venues sit at lat -22..-35, lng 16..33.
  if (lat > 0 && lat < 40 && lng > 15 && lng < 34) {
    warnings.push("Latitude is north of the equator. Southern African venues need a negative (south) latitude.");
  }
  return { lat: round(lat), lng: round(lng), format: result.format, warnings };
}
