import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import useInstallPrompt from "../hooks/useInstallPrompt";

const NAV_LINKS = [
  { label: "Overview", to: "/#stats" },
  { label: "Events", to: "/#events" },
  { label: "Divisions", to: "/#divisions" },
  { label: "Matches", to: "/#matches" },
  { label: "Teams", to: "/#teams" },
  { label: "League DB", to: "/teams" },
];

const ROLE_LINKS = [
  { label: "Score keeper", to: "/score-keeper" },
  { label: "Captain", to: "/captain" },
  { label: "Admin", to: "/admin" },
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
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  async function handleInstallClick() {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        setShowInstallGuide(false);
        return;
      }
    }
    setShowInstallGuide(true);
  }

  return (
    <>
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

        <div className="hidden items-center gap-1 rounded-full bg-slate-100 p-1 text-xs font-semibold text-slate-600 lg:flex">
          {ROLE_LINKS.map((role) => (
            <Link
              key={role.to}
              to={role.to}
              className="rounded-full px-3 py-1 transition hover:bg-white hover:text-slate-900"
            >
              {role.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleInstallClick}
            className="hidden rounded-full border border-brand/30 px-4 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand/10 md:inline-flex"
          >
            Install app
          </button>
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
              {ROLE_LINKS.map((role) => (
                <Link
                  key={role.to}
                  to={role.to}
                  className="rounded px-2 py-1 hover:bg-slate-100"
                >
                  {role.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleInstallClick}
                className="rounded-full border border-brand/30 px-4 py-2 text-center text-sm font-semibold text-brand-dark transition hover:bg-brand/10"
              >
                Install app
              </button>
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

      {showInstallGuide && (
        <div className="border-b border-slate-200 bg-white/95">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-4">
              <p className="text-base font-semibold text-slate-900">Install StallCount</p>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            <p>
              Most browsers show an install option in the menu (Share sheet or browser menu). Follow these quick steps:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Open your browser menu or share sheet.</li>
              <li>Select &ldquo;Add to Home Screen&rdquo; or &ldquo;Install app&rdquo;.</li>
              <li>Confirm the prompt to pin StallCount to your device.</li>
            </ol>
            {!canInstall && (
              <p className="text-xs text-slate-500">
                If you do not see the option, make sure you are using the latest version of Chrome, Edge, Safari,
                or Firefox on a supported device.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
