import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import SeoManager from "./components/SeoManager";
import ErrorBoundary from "./components/ErrorBoundary";

import AppLayout from "./components/AppLayout";
import {
  ADMIN_ACCESS_ACCESS_ROLES,
  CAPTAIN_ACCESS_PERMISSIONS,
  EVENT_ACCESS_PERMISSIONS,
  MEDIA_ACCESS_PERMISSIONS,
  SPIRIT_SCORES_ACCESS_ROLES,
  SCOREKEEPER_ACCESS_PERMISSIONS,
  SCOREKEEPER_ACCESS_ROLES,
  SYS_ADMIN_ACCESS_PERMISSIONS,
  TOURNAMENT_DIRECTOR_ACCESS_ROLES,
  MATCH_CORRECTIONS_ACCESS_ROLES,
} from "./utils/accessControl";
import { eventWorkspaces } from "./pages/eventWorkspaces";

const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const Players = lazy(() => import("./pages/PlayersPage"));
const PlayerProfilePage = lazy(() => import("./pages/PlayerProfilePage"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamProfilePage = lazy(() => import("./pages/TeamProfile"));
const MatchesPage = lazy(() => import("./pages/MatchesPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const EventSetupWizardPage = lazy(() => import("./pages/EventSetupWizard"));
const ModularScoreKeeperPage = lazy(() => import("./pages/ModularScoreKeeperPage"));
const ScrimmagePage = lazy(() => import("./pages/ScrimmagePage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const CaptainPage = lazy(() => import("./pages/CaptainPage"));
const SysAdminPage = lazy(() => import("./pages/SysAdminPage"));
const PlayerMergePage = lazy(() => import("./pages/PlayerMergePage"));
const UserPage = lazy(() => import("./pages/UserPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const CustomScriptsPage = lazy(() => import("./pages/CustomScriptsPage"));
const AdminAccessPage = lazy(() => import("./pages/AdminAccessPage"));
const EventAccessPage = lazy(() => import("./pages/EventAccessPage"));
const SignupManagementPage = lazy(() => import("./pages/SignupManagementPage"));
const SpiritScoresPage = lazy(() => import("./pages/SpiritScoresPage"));
const TournamentDirectorPage = lazy(() => import("./pages/TournamentDirectorPage"));
const MatchCorrectionsPage = lazy(() => import("./pages/MatchCorrectionsPage"));
const PlayoffStructurePage = lazy(() => import("./pages/PlayoffStructurePage"));
const MediaAdminPage = lazy(() => import("./pages/MediaAdminPage"));
const EventRostersPageLazy = lazy(() => import("./pages/EventRostersPage"));
const EventRulesPageLazy = lazy(() => import("./pages/EventRulesPage"));
const cptMxLeagueWorkspace = eventWorkspaces.find(
  (workspace) => workspace.path === "/events/ctfda-mx-league",
);

const routeFallback = (
  <div className="sc-shell flex min-h-[40vh] items-center justify-center text-sm text-[var(--sc-ink-muted)]">
    Loading...
  </div>
);

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function Guarded({ name, children }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

/**
 * `/score-keeper-modular` -> `/score-keeper`, keeping the query string.
 *
 * The console moved onto the plain path once it replaced the 7v7 and 5v5
 * builds. The search params have to survive the trip because `?mode=` is what
 * selects the format — dropping it would land a bookmarked Casual match on the
 * format picker instead.
 */
function RedirectToScoreKeeper() {
  const { search } = useLocation();
  return <Navigate to={`/score-keeper${search}`} replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <SeoManager />
      <ScrollToTop />
      <Suspense fallback={routeFallback}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Guarded name="Home"><HomePage /></Guarded>} />
          <Route path="/login" element={<Guarded name="Login"><LoginPage /></Guarded>} />
          <Route path="/players" element={<Guarded name="Players"><Players /></Guarded>} />
          <Route path="/players/:playerId" element={<Guarded name="Player profile"><PlayerProfilePage /></Guarded>} />
          <Route path="/teams" element={<Guarded name="Teams"><Teams /></Guarded>} />
          <Route path="/teams/:teamId" element={<Guarded name="Team profile"><TeamProfilePage /></Guarded>} />
          <Route path="/matches" element={<Guarded name="Matches"><MatchesPage /></Guarded>} />
          <Route path="/events" element={<Guarded name="Events"><EventsPage /></Guarded>} />
          <Route path="/community" element={<Guarded name="Community"><CommunityPage /></Guarded>} />
          <Route path="/event-rosters" element={<Guarded name="Event rosters"><EventRostersPageLazy /></Guarded>} />
          <Route path="/event-rules" element={<Guarded name="Event rules"><EventRulesPageLazy /></Guarded>} />
          {cptMxLeagueWorkspace ? (
            <Route
              path="/events/ctfda-mx-league"
              element={<Guarded name="CPT MX League workspace"><cptMxLeagueWorkspace.Component /></Guarded>}
            />
          ) : null}
          {eventWorkspaces
            .filter((workspace) => workspace.path !== "/events/ctfda-mx-league")
            .map((workspace) => (
            <Route
              key={workspace.path}
              path={workspace.path}
              element={<Guarded name={`Event workspace: ${workspace.path}`}><workspace.Component /></Guarded>}
            />
          ))}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Guarded name="Notifications"><NotificationsPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route path="/user" element={<Guarded name="User profile"><UserPage /></Guarded>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireNonViewer>
                <Guarded name="Admin hub"><AdminPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/access"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ACCESS_ACCESS_ROLES}>
                <Guarded name="Access control"><AdminAccessPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/event-access"
            element={
              <ProtectedRoute allowedPermissions={EVENT_ACCESS_PERMISSIONS}>
                <Guarded name="Event access control"><EventAccessPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/signup-management"
            element={
              <ProtectedRoute allowedRoles={TOURNAMENT_DIRECTOR_ACCESS_ROLES}>
                <Guarded name="Signup management"><SignupManagementPage /></Guarded>
              </ProtectedRoute>
            }
          />
          {/* Gated on ROLES, not permissions. Spirit scoring is a captain's
              duty, but captains hold no match permissions — so a permission
              gate (match_insert/match_update) excluded exactly the people the
              form is for, while admitting any match-writing role. The audience
              is a role question, so ask it directly. */}
          <Route
            path="/spirit-scores"
            element={
              <ProtectedRoute allowedRoles={SPIRIT_SCORES_ACCESS_ROLES}>
                <Guarded name="Spirit scores"><SpiritScoresPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tournament-director"
            element={
              <ProtectedRoute allowedRoles={TOURNAMENT_DIRECTOR_ACCESS_ROLES}>
                <Guarded name="Tournament director"><TournamentDirectorPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/match-corrections"
            element={
              <ProtectedRoute allowedRoles={MATCH_CORRECTIONS_ACCESS_ROLES}>
                <Guarded name="Match corrections"><MatchCorrectionsPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/playoff-structure"
            element={
              <ProtectedRoute allowedRoles={["admin", "administrator", "sys_admin", "tournament_director"]}>
                <Guarded name="Playoff structure"><PlayoffStructurePage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/media"
            element={
              <ProtectedRoute allowedPermissions={MEDIA_ACCESS_PERMISSIONS}>
                <Guarded name="Media admin"><MediaAdminPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/event-setup"
            element={
              <ProtectedRoute allowedRoles={TOURNAMENT_DIRECTOR_ACCESS_ROLES}>
                <Guarded name="Event setup"><EventSetupWizardPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/custom-scripts"
            element={
              <ProtectedRoute allowedPermissions={SYS_ADMIN_ACCESS_PERMISSIONS}>
                <Guarded name="Custom scripts"><CustomScriptsPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/captain"
            element={
              <ProtectedRoute allowedPermissions={CAPTAIN_ACCESS_PERMISSIONS}>
                <Guarded name="Captain"><CaptainPage /></Guarded>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sys-admin"
            element={
              <ProtectedRoute allowedPermissions={SYS_ADMIN_ACCESS_PERMISSIONS}>
                <Guarded name="Sys admin"><SysAdminPage /></Guarded>
              </ProtectedRoute>
            }
          />
          {/* Same admin_override gate as /sys-admin: the merge deletes player
              rows and rewrites every reference to them. */}
          <Route
            path="/sys-admin/player-merge"
            element={
              <ProtectedRoute allowedPermissions={SYS_ADMIN_ACCESS_PERMISSIONS}>
                <Guarded name="Player merge"><PlayerMergePage /></Guarded>
              </ProtectedRoute>
            }
          />
        </Route>
        {/* The modular console, and the only one. It replaced the separate 7v7
            and 5v5 consoles, which are gone: the format now comes from `?mode=`
            (`full` / `lite`, or the legacy `7v7` / `5v5` spellings), so one
            console covers both. With no valid mode this is the landing page. */}
        <Route
          path="/score-keeper"
          element={
            <ProtectedRoute
              allowedRoles={SCOREKEEPER_ACCESS_ROLES}
              allowedPermissions={SCOREKEEPER_ACCESS_PERMISSIONS}
            >
              <Guarded name="Score keeper"><ModularScoreKeeperPage /></Guarded>
            </ProtectedRoute>
          }
        />
        {/* Bookmarks and links from before the replacement. `/score-keeper-5v5`
            carries its format across so those land on the Casual console rather
            than dumping the operator back on the picker. */}
        <Route
          path="/score-keeper-modular"
          element={<RedirectToScoreKeeper />}
        />
        <Route
          path="/score-keeper-5v5"
          element={<Navigate to="/score-keeper?mode=5v5" replace />}
        />
        <Route
          path="/admin/scrimmage"
          element={
            <Guarded name="Scrimmage"><ScrimmagePage /></Guarded>
          }
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
