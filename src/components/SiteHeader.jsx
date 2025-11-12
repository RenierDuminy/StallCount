import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_LINKS = [
  { label: "Overview", to: "/#stats" },
  { label: "Events", to: "/#events" },
  { label: "Divisions", to: "/#divisions" },
  { label: "Matches", to: "/#matches" },
  { label: "Teams", to: "/#teams" },
  { label: "League DB", to: "/teams" },
];

function isLinkActive(linkTo, location) {
  if (!linkTo.startsWith("/#")) {
    return location.pathname === linkTo;
  }

  const hashTarget = linkTo.replace("/#", "#");
  return location.pathname === "/" && location.hash === hashTarget;
}

export default function SiteHeader() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/assets/stallcount-logo.svg"
            alt="StallCount logo"
            className="h-11 w-11 rounded-2xl object-contain ring-1 ring-brand/20"
            loading="lazy"
          />
          <div>
            <p className="text-lg font-semibold text-slate-900">StallCount</p>
            <p className="text-sm text-slate-500">Frisbee League Tracker</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(link.to, location);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`transition-colors hover:text-slate-900 ${
                  active ? "text-slate-900" : ""
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900 md:inline-flex"
          >
            Log in
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900 md:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            Menu
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm font-semibold text-slate-700">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="rounded px-2 py-1 hover:bg-slate-100">
                {link.label}
              </Link>
            ))}
            <Link
              to="/login"
              className="rounded-full border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              Log in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
