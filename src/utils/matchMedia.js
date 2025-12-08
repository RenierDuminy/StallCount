function sanitizeUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseMediaLink(mediaLink) {
  if (!mediaLink) return null;
  if (typeof mediaLink === "object") {
    return mediaLink;
  }
  if (typeof mediaLink === "string") {
    try {
      return JSON.parse(mediaLink);
    } catch {
      return null;
    }
  }
  return null;
}

function formatMediaProviderLabel(provider) {
  const normalized = typeof provider === "string" ? provider.replace(/_/g, " ").trim() : "";
  if (!normalized) return "Stream";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getMatchMediaDetails(match) {
  if (!match) return null;
  const mediaLink = parseMediaLink(match.media_link);
  const primary = mediaLink?.primary || {};
  const vodEntries = Array.isArray(mediaLink?.vod) ? mediaLink.vod : [];
  const candidateUrls = [
    sanitizeUrl(match.media_url),
    sanitizeUrl(primary.url),
    ...vodEntries.map((entry) => sanitizeUrl(entry?.url)),
  ].filter(Boolean);

  const url = candidateUrls.find((value) => /^https?:\/\//i.test(value));
  if (!url) return null;

  const providerCandidates = [
    match.media_provider,
    primary.provider,
    ...vodEntries.map((entry) => entry?.provider),
  ];
  const provider =
    providerCandidates.find((value) => typeof value === "string" && value.trim()) || "";

  return {
    url,
    providerLabel: formatMediaProviderLabel(provider),
    status: match.media_status || primary.status || "",
  };
}
