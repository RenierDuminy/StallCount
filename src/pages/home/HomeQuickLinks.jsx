import { Link } from "react-router-dom";

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

const QUICK_LINKS = [
  {
    to: "/events",
    label: "Events",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    to: "/matches",
    label: "Matches",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 21V3.5" />
        <path d="M5 4.5c2.3-1.4 4.7-1.4 7 0s4.7 1.4 7 0v8.5c-2.3 1.4-4.7 1.4-7 0s-4.7-1.4-7 0" />
      </svg>
    ),
  },
  {
    to: "/teams",
    label: "Teams",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="3" />
        <path d="M6.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
        <circle cx="5.5" cy="9.5" r="2.2" />
        <path d="M2 17.5c.4-2 1.7-3.2 3.5-3.4" />
        <circle cx="18.5" cy="9.5" r="2.2" />
        <path d="M22 17.5c-.4-2-1.7-3.2-3.5-3.4" />
      </svg>
    ),
  },
  {
    to: "/players",
    label: "Players",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
      </svg>
    ),
  },
];

export function HomeQuickLinks() {
  return (
    <nav className="home-quick-links" aria-label="Browse StallCount">
      {QUICK_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="home-quick-link">
          <span className="home-quick-link__icon">{link.icon}</span>
          <span>{link.label}</span>
        </Link>
      ))}
    </nav>
  );
}
