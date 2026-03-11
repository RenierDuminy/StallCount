import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_NAME = "StallCount";
const DEFAULT_DESCRIPTION =
  "StallCount provides live Ultimate Frisbee scoring, event tracking, and team updates.";

const INDEXABLE_PATH_PATTERNS = [
  /^\/$/,
  /^\/events$/,
  /^\/matches$/,
  /^\/teams$/,
  /^\/teams\/[^/]+$/,
  /^\/players$/,
  /^\/players\/[^/]+$/,
  /^\/community$/,
  /^\/event-rules$/,
  /^\/event-rosters$/,
];

const ROUTE_META = [
  {
    pattern: /^\/$/,
    title: "StallCount | Live Ultimate Frisbee Scoring",
    description:
      "Track live scores, standings, fixtures, and community updates for Ultimate Frisbee events.",
  },
  {
    pattern: /^\/events$/,
    title: "Events | StallCount",
    description: "Browse active and upcoming Ultimate Frisbee events on StallCount.",
  },
  {
    pattern: /^\/matches$/,
    title: "Matches | StallCount",
    description: "Follow live match progress and results.",
  },
  {
    pattern: /^\/teams$/,
    title: "Teams | StallCount",
    description: "Explore teams, rosters, and performance insights.",
  },
  {
    pattern: /^\/teams\/[^/]+$/,
    title: "Team Profile | StallCount",
    description: "View team profile details, stats, and match context.",
  },
  {
    pattern: /^\/players$/,
    title: "Players | StallCount",
    description: "Browse player profiles and participation details.",
  },
  {
    pattern: /^\/players\/[^/]+$/,
    title: "Player Profile | StallCount",
    description: "View player profile details and event participation.",
  },
  {
    pattern: /^\/community$/,
    title: "Community | StallCount",
    description: "Community updates and shared media from events and leagues.",
  },
  {
    pattern: /^\/event-rules$/,
    title: "Event Rules | StallCount",
    description: "Read event and competition rules used in StallCount.",
  },
  {
    pattern: /^\/event-rosters$/,
    title: "Event Rosters | StallCount",
    description: "Review event roster information by team and division.",
  },
  {
    pattern: /^\/login$/,
    title: "Login | StallCount",
    description: "Sign in to access role-based StallCount tools.",
  },
];

function getSiteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  const envSiteUrl = import.meta.env.VITE_SITE_URL?.trim();
  if (envSiteUrl) {
    return envSiteUrl.replace(/\/$/, "");
  }

  return "https://stallcount.vercel.app";
}

function getRouteMeta(pathname) {
  for (const item of ROUTE_META) {
    if (item.pattern.test(pathname)) {
      return item;
    }
  }

  return {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
  };
}

function isIndexablePath(pathname) {
  return INDEXABLE_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function upsertMetaAttribute(attrName, attrValue, content) {
  if (!attrValue) {
    return;
  }

  let meta = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attrName, attrValue);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function upsertCanonical(url) {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", url);
}

function upsertStructuredData(siteOrigin) {
  const payload = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: siteOrigin,
      logo: `${siteOrigin}/assets/stallcount-logo.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: siteOrigin,
    },
  ];

  let script = document.head.querySelector('script[data-seo="structured-data"]');
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo", "structured-data");
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(payload);
}

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname || "/";
    const siteOrigin = getSiteOrigin();
    const canonicalUrl = `${siteOrigin}${pathname}`;
    const indexable = isIndexablePath(pathname);
    const routeMeta = getRouteMeta(pathname);

    document.title = routeMeta.title;

    upsertMetaAttribute("name", "description", routeMeta.description);
    upsertMetaAttribute("name", "robots", indexable ? "index,follow" : "noindex,nofollow");

    upsertMetaAttribute("property", "og:title", routeMeta.title);
    upsertMetaAttribute("property", "og:description", routeMeta.description);
    upsertMetaAttribute("property", "og:type", "website");
    upsertMetaAttribute("property", "og:url", canonicalUrl);
    upsertMetaAttribute("property", "og:site_name", SITE_NAME);
    upsertMetaAttribute("property", "og:image", `${siteOrigin}/assets/stallcount-logo.png`);

    upsertMetaAttribute("name", "twitter:card", "summary_large_image");
    upsertMetaAttribute("name", "twitter:title", routeMeta.title);
    upsertMetaAttribute("name", "twitter:description", routeMeta.description);
    upsertMetaAttribute("name", "twitter:image", `${siteOrigin}/assets/stallcount-logo.png`);

    upsertCanonical(canonicalUrl);
    upsertStructuredData(siteOrigin);
  }, [location.pathname]);

  return null;
}
