import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { useAuth } from "../context/AuthContext";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Events", to: "/events" },
  { label: "Matches", to: "/matches" },
  { label: "Teams", to: "/teams" },
  { label: "Players", to: "/players" },
];

const ROLE_LINKS = [
  { label: "User", to: "/user" },
  { label: "Notifications", to: "/notifications" },
  { label: "Admin tools", to: "/admin" },
  { label: "Scrimmage", to: "/admin/scrimmage" },
];

function isLinkActive(linkTo, location) {
  if (!linkTo.startsWith("/#")) {
    return location.pathname === linkTo;
  }

  const hashTarget = linkTo.replace("/#", "#");
  return location.pathname === "/" && location.hash === hashTarget;
}

export default function SiteHeader() {
  const { session, roles } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();
  const user = session?.user ?? null;
  const hasLoadedRoles = Array.isArray(roles);
  const showAdminTools = hasLoadedRoles
    ? roles.some((role) => role?.roleId !== null && role?.roleId !== undefined && role?.roleId !== 14)
    : false;
  const roleLinks = ROLE_LINKS.filter((link) => {
    if (link.to === "/admin") {
      return showAdminTools;
    }
    return true;
  });

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
      <header className="border-b border-[var(--sc-border)]/50 bg-[var(--sc-bg-accent)] text-[var(--sc-ink)]">
        <div className="sc-shell flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-3 text-[var(--sc-ink)]">
            <img
              src="/assets/stallcount-logo.svg"
              alt="StallCount logo"
              className="h-11 w-11 rounded-2xl border border-white/10 bg-white/10 object-contain p-1"
              loading="lazy"
            />
            <div>
              <p className="text-lg font-semibold leading-tight">StallCount</p>
              <p className="text-sm text-[var(--sc-ink-muted)]">Ultimate Frisbee League Tracker</p>
            </div>
          </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--sc-ink-muted)] md:flex">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(link.to, location);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`transition-colors hover:text-[var(--sc-ink)] ${active ? "text-[var(--sc-ink)]" : ""}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-1 rounded-full bg-[var(--sc-border-strong)] p-1 text-xs font-semibold text-[var(--sc-ink)] lg:flex">
          {roleLinks.map((role) => (
            <Link
              key={role.to}
              to={role.to}
              className="rounded-full px-3 py-1 transition hover:bg-white/20"
            >
              {role.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[var(--sc-ink)]">
          <button
            type="button"
            onClick={handleInstallClick}
            className="hidden rounded-full border border-[var(--sc-border)] px-4 py-2 text-sm font-semibold text-[var(--sc-ink)] transition hover:bg-white/10 lg:inline-flex"
          >
            Install app
          </button>
          <Link
            to="/login"
            className="hidden rounded-full border border-[var(--sc-border)] px-4 py-2 text-sm font-semibold text-[var(--sc-ink)] transition hover:bg-white/10 lg:inline-flex"
          >
            Log in
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-[var(--sc-border)] px-4 py-3 text-base font-semibold text-[var(--sc-ink)] transition hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            Menu
          </button>
        </div>

        </div>
        {menuOpen && (
          <div className="border-t border-[var(--sc-border)]/50 bg-[var(--sc-surface)] px-6 py-4 text-[var(--sc-ink)] lg:hidden">
            <nav className="flex flex-col gap-3 text-sm font-semibold">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="rounded px-2 py-1 transition hover:bg-white/10"
                >
                  {link.label}
                </Link>
              ))}
              {roleLinks.map((role) => (
                <Link
                  key={role.to}
                  to={role.to}
                  className="rounded px-2 py-1 transition hover:bg-white/10"
                >
                  {role.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleInstallClick}
                className="rounded-full border border-[var(--sc-border)] px-4 py-2 text-center text-sm font-semibold text-[var(--sc-ink)] transition hover:bg-white/10"
              >
                Install app
              </button>
              <Link
                to="/login"
                className="rounded-full border border-[var(--sc-border)] px-4 py-2 text-center text-sm font-semibold text-[var(--sc-ink)] transition hover:bg-white/10"
              >
                Log in
              </Link>
            </nav>
          </div>
        )}
      </header>

      {showInstallGuide && (
        <div className="border-b border-[var(--sc-border)]/40 bg-white/95 text-ink">
          <div className="sc-shell flex flex-col gap-3 py-4 text-sm text-ink-muted">
            <div className="flex items-start justify-between gap-4">
              <p className="text-base font-semibold text-ink">Install StallCount</p>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
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
              <p className="text-xs text-ink-muted">
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
