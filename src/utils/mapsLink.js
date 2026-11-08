// Directions link for a venue that opens the device's own maps app.
//
// There is no single URL every platform hands to its default maps app, so the
// scheme is picked per platform:
// - iOS / iPadOS / macOS: maps.apple.com opens Apple Maps (iPadOS reports a
//   Mac user agent, so it lands here too).
// - Android: geo: opens the user's default maps app, or the app chooser.
// - Anything else: Google Maps in the browser.

const toCoordinate = (value) => {
  const number = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(number) ? number : null;
};

/** `{ lat, lng }` for a venue with usable coordinates, else null. */
export function getVenueCoordinates(venue) {
  const lat = toCoordinate(venue?.latitude);
  const lng = toCoordinate(venue?.longitude);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent || "";
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod|macintosh/i.test(userAgent)) return "apple";
  return "other";
}

/** URL that opens the venue in the platform's maps app, or null without coordinates. */
export function buildVenueMapsUrl(venue) {
  const coordinates = getVenueCoordinates(venue);
  if (!coordinates) return null;
  const point = `${coordinates.lat},${coordinates.lng}`;
  const label = venue?.name || "";

  switch (detectPlatform()) {
    case "apple":
      return `https://maps.apple.com/?ll=${point}&q=${encodeURIComponent(label || point)}`;
    case "android":
      return `geo:${point}?q=${point}${label ? `(${encodeURIComponent(label)})` : ""}`;
    default:
      return `https://www.google.com/maps/search/?api=1&query=${point}`;
  }
}
