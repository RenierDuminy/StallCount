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

const ROLE_LINKS = [
  { label: "User", to: "/user" },
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
  const roleLinks = ROLE_LINKS.filter((link) => {
    if (link.to === "/tournament-director") {
      return showTournamentDirector;
    }
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

        <nav className="hidden items-center gap-1 text-sm font-semibold text-[var(--sc-ink-muted)] md:flex">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(link.to, location);
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={`rounded-md border border-transparent px-3 py-2 transition ${
                  active
                    ? "border-[var(--sc-border-strong)] bg-white/[0.08] text-[var(--sc-ink)] shadow-[inset_0_-2px_0_var(--sc-accent)]"
                    : "hover:bg-white/[0.06] hover:text-[var(--sc-ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 border-l border-[var(--sc-border)]/70 pl-4 text-xs font-semibold text-[var(--sc-ink-muted)] lg:flex">
          {roleLinks.map((role) => {
            const active = isLinkActive(role.to, location);
            const activeToneClass = isAdminToneLink(role.to)
              ? "border-admin text-admin-ink"
              : "border-[var(--sc-accent)] text-[var(--sc-ink)]";
            return (
              <Link
                key={role.to}
                to={role.to}
                aria-current={active ? "page" : undefined}
                className={`border-b-2 py-1 transition ${
                  active
                    ? activeToneClass
                    : "border-transparent hover:border-[var(--sc-border-strong)] hover:text-[var(--sc-ink)]"
                }`}
              >
                {role.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[var(--sc-ink)]">
          <button
            type="button"
            onClick={handleInstallClick}
            className="hidden rounded-md border border-[var(--sc-border)] px-3 py-2 text-sm font-semibold text-[var(--sc-ink)] transition hover:border-[var(--sc-border-strong)] hover:bg-white/[0.08] lg:inline-flex"
          >
            Install app
          </button>
          {!user && (
            <Link
              to="/login"
              className="hidden rounded-md border border-[var(--sc-border)] px-3 py-2 text-sm font-semibold text-[var(--sc-ink)] transition hover:border-[var(--sc-border-strong)] hover:bg-white/[0.08] lg:inline-flex"
            >
              Log in
            </Link>
          )}
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--sc-border)] text-[var(--sc-ink)] transition hover:border-[var(--sc-border-strong)] hover:bg-white/[0.08] lg:hidden"
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
          <div className="border-t border-[var(--sc-border)]/50 bg-[var(--sc-surface)] px-5 py-4 text-[var(--sc-ink)] lg:hidden">
            <nav className="flex flex-col gap-2 text-sm font-semibold">
              {NAV_LINKS.map((link) => {
                const active = isLinkActive(link.to, location);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md border px-3 py-2 transition ${
                      active
                        ? "border-[var(--sc-border-strong)] bg-white/[0.08] text-[var(--sc-ink)]"
                        : "border-transparent text-[var(--sc-ink-muted)] hover:bg-white/[0.08] hover:text-[var(--sc-ink)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {roleLinks.length > 0 && (
                <div className="my-1 border-t border-[var(--sc-border)]/70" />
              )}
              {roleLinks.map((role) => {
                const active = isLinkActive(role.to, location);
                const activeToneClass = isAdminToneLink(role.to)
                  ? "border-admin-border bg-admin-bg text-admin-ink"
                  : "border-[var(--sc-border-strong)] bg-white/[0.08] text-[var(--sc-ink)]";
                return (
                  <Link
                    key={role.to}
                    to={role.to}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md border px-3 py-2 transition ${
                      active
                        ? activeToneClass
                        : "border-transparent text-[var(--sc-ink-muted)] hover:bg-white/[0.08] hover:text-[var(--sc-ink)]"
                    }`}
                  >
                    {role.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleInstallClick}
                className="mt-1 rounded-md border border-[var(--sc-border)] px-4 py-2 text-center text-sm font-semibold text-[var(--sc-ink)] transition hover:border-[var(--sc-border-strong)] hover:bg-white/[0.08]"
              >
                Install app
              </button>
              {!user && (
                <Link
                  to="/login"
                  className="rounded-md border border-[var(--sc-border)] px-4 py-2 text-center text-sm font-semibold text-[var(--sc-ink)] transition hover:border-[var(--sc-border-strong)] hover:bg-white/[0.08]"
                >
                  Log in
                </Link>
              )}
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
