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

const HOST_PROVIDER_MAP = [
  { tokens: ["youtube", "youtu.be"], code: "youtube", label: "YouTube" },
  { tokens: ["twitch"], code: "twitch", label: "Twitch" },
  { tokens: ["vimeo"], code: "vimeo", label: "Vimeo" },
  { tokens: ["facebook", "fb.watch"], code: "facebook", label: "Facebook" },
  { tokens: ["instagram"], code: "instagram", label: "Instagram" },
  { tokens: ["twitter", "x.com"], code: "twitter", label: "Twitter" },
  { tokens: ["espn"], code: "espn", label: "ESPN" },
  { tokens: ["ultiworld"], code: "ultiworld", label: "Ultiworld" },
];

function formatMediaProviderLabel(provider) {
  const normalized = typeof provider === "string" ? provider.replace(/_/g, " ").trim() : "";
  if (!normalized) return "Stream";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferProviderFromUrl(url) {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    const mapped = HOST_PROVIDER_MAP.find((entry) => entry.tokens.some((token) => host.includes(token)));
    if (mapped) return mapped.label;
    const cleanHost = host.replace(/^www\./, "");
    const segments = cleanHost.split(".");
    const tld = segments[segments.length - 1] || "";
    let baseSegment = segments.length > 1 ? segments[segments.length - 2] : segments[0];
    if (tld.length === 2 && segments.length > 2) {
      baseSegment = segments[segments.length - 3];
    }
    if (!baseSegment) return null;
    return baseSegment.charAt(0).toUpperCase() + baseSegment.slice(1);
  } catch {
    return null;
  }
}

export function inferProviderCodeFromUrl(url) {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    const mapped = HOST_PROVIDER_MAP.find((entry) => entry.tokens.some((token) => host.includes(token)));
    return mapped ? mapped.code : null;
  } catch {
    return null;
  }
}

export function resolveMediaProviderLabel(provider, url) {
  const baseLabel = formatMediaProviderLabel(provider);
  const normalized = baseLabel.toLowerCase();
  if (normalized !== "stream" && normalized !== "custom") {
    return baseLabel;
  }
  const inferred = inferProviderFromUrl(url);
  if (inferred) return inferred;
  return baseLabel;
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
    providerLabel: resolveMediaProviderLabel(provider, url),
    status: match.media_status || primary.status || "",
  };
}
