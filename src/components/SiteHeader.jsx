import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { useAuth } from "../context/AuthContext";
import { normaliseRoleList } from "../utils/accessControl";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Events", to: "/events" },
  { label: "Matches", to: "/matches" },
  { label: "Teams", to: "/teams" },
  { label: "Players", to: "/players" },
  { label: "Community", to: "/community" },
];

// Signed-in only: /user and /notifications are protected routes, so showing
// them to a visitor would only lead to a login wall.
const ACCOUNT_LINKS = [
  { label: "Profile", to: "/user" },
  { label: "Notifications", to: "/notifications" },
  { label: "Tournament director", to: "/tournament-director" },
  { label: "Admin tools", to: "/admin" },
];

function isLinkActive(linkTo, location) {
  if (!linkTo.startsWith("/#")) {
    if (linkTo === "/") {
      return location.pathname === "/";
    }
    return location.pathname === linkTo || location.pathname.startsWith(`${linkTo}/`);
  }

  const hashTarget = linkTo.replace("/#", "#");
  return location.pathname === "/" && location.hash === hashTarget;
}

function isAdminToneLink(linkTo) {
  return linkTo === "/admin" || linkTo === "/tournament-director";
}

export default function SiteHeader() {
  const { session, roles } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();
  const user = session?.user ?? null;
  const hasLoadedRoles = Array.isArray(roles);
  const showTournamentDirector = hasLoadedRoles
    ? roles.some((role) => {
        const normalizedRoleNames = normaliseRoleList(
          role?.roleName || role?.role?.name || role?.name || "",
        );
        return normalizedRoleNames.includes("tournament_director");
      })
    : false;
  const showAdminTools = hasLoadedRoles
    ? roles.some((role) => {
        const normalizedRoleNames = normaliseRoleList(
          role?.roleName || role?.role?.name || role?.name || "",
        );
        if (normalizedRoleNames.length > 0) {
          return normalizedRoleNames.some((name) => name !== "user");
        }
        return false;
      })
    : false;
  const accountLinks = user
    ? ACCOUNT_LINKS.filter((link) => {
        if (link.to === "/tournament-director") {
          return showTournamentDirector;
        }
        if (link.to === "/admin") {
          return showAdminTools;
        }
        return true;
      })
    : [];

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
      <header className="sc-site-header">
        <div className="sc-shell sc-site-header__bar">
          <Link to="/" className="sc-site-header__brand">
            <img
              src="/assets/stallcount-logo.svg"
              alt="StallCount"
              className="sc-site-header__logo"
              loading="lazy"
            />
            <span className="sc-site-header__tagline">Ultimate Frisbee League Tracker</span>
          </Link>

          <nav className="sc-site-header__nav" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={isLinkActive(link.to, location) ? "page" : undefined}
                className="sc-nav-link"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="sc-site-header__actions">
            {user && (
              <nav className="sc-account-links sc-site-header__desktop-only" aria-label="Account">
                {accountLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={isLinkActive(link.to, location) ? "page" : undefined}
                    className={`sc-account-link${isAdminToneLink(link.to) ? " is-admin" : ""}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
            <button type="button" onClick={handleInstallClick} className="sc-header-button sc-site-header__desktop-only">
              Install app
            </button>
            {!user && (
              <Link to="/login" className="sc-header-button is-primary sc-site-header__desktop-only">
                Log in
              </Link>
            )}
            <button
              type="button"
              className="sc-header-button is-icon sc-site-header__mobile-only"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <span className="sr-only">Menu</span>
              <span aria-hidden="true" className="flex h-4 w-5 flex-col justify-between">
                <span className={`h-0.5 rounded-full bg-current transition ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
                <span className={`h-0.5 rounded-full bg-current transition ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`h-0.5 rounded-full bg-current transition ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
              </span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="sc-site-header__menu sc-site-header__mobile-only">
            <nav className="sc-shell sc-site-header__menu-inner" aria-label="Main">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isLinkActive(link.to, location) ? "page" : undefined}
                  className="sc-menu-link"
                >
                  {link.label}
                </Link>
              ))}
              {accountLinks.length > 0 && (
                <>
                  <hr className="sc-site-header__menu-divider" />
                  {accountLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      aria-current={isLinkActive(link.to, location) ? "page" : undefined}
                      className={`sc-menu-link${isAdminToneLink(link.to) ? " is-admin" : ""}`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </>
              )}
              <div className="sc-site-header__menu-actions">
                {!user && (
                  <Link to="/login" className="sc-header-button is-primary">
                    Log in
                  </Link>
                )}
                <button type="button" onClick={handleInstallClick} className="sc-header-button">
                  Install app
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {showInstallGuide && (
        <div className="border-b border-warning-border bg-warning-bg text-warning-ink">
          <div className="sc-shell flex flex-col gap-3 py-4 text-sm text-warning-ink">
            <div className="flex items-start justify-between gap-4">
              <p className="text-base font-semibold text-warning-ink">Install StallCount</p>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="text-xs font-semibold uppercase tracking-wide text-warning-ink hover:text-white"
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
              <p className="text-xs text-warning-ink">
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
