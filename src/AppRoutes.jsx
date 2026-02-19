import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

import AppLayout from "./components/AppLayout";
import {
  ADMIN_ACCESS_PERMISSIONS,
  CAPTAIN_ACCESS_PERMISSIONS,
  EVENT_ACCESS_PERMISSIONS,
  EVENT_SETUP_ACCESS_PERMISSIONS,
  MEDIA_ACCESS_PERMISSIONS,
  SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS,
  SPIRIT_SCORES_ACCESS_PERMISSIONS,
  SCOREKEEPER_ACCESS_PERMISSIONS,
  SYS_ADMIN_ACCESS_PERMISSIONS,
  TOURNAMENT_DIRECTOR_ACCESS_PERMISSIONS,
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
const ScoreKeeperPage = lazy(() => import("./pages/ScoreKeeperPage"));
const ScoreKeeper5v5Page = lazy(() => import("./pages/ScoreKeeper5v5Page"));
const ScrimmagePage = lazy(() => import("./pages/ScrimmagePage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const CaptainPage = lazy(() => import("./pages/CaptainPage"));
const SysAdminPage = lazy(() => import("./pages/SysAdminPage"));
const UserPage = lazy(() => import("./pages/UserPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminScoreboardDebugPage = lazy(() => import("./pages/AdminScoreboardDebugPage"));
const AdminAccessPage = lazy(() => import("./pages/AdminAccessPage"));
const EventAccessPage = lazy(() => import("./pages/EventAccessPage"));
const SignupManagementPage = lazy(() => import("./pages/SignupManagementPage"));
const SpiritScoresPage = lazy(() => import("./pages/SpiritScoresPage"));
const TournamentDirectorPage = lazy(() => import("./pages/TournamentDirectorPage"));
const MediaAdminPage = lazy(() => import("./pages/MediaAdminPage"));
const EventRostersPageLazy = lazy(() => import("./pages/EventRostersPage"));

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

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:playerId" element={<PlayerProfilePage />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/event-rosters" element={<EventRostersPageLazy />} />
          {eventWorkspaces.map((workspace) => (
            <Route
              key={workspace.path}
              path={workspace.path}
              element={<workspace.Component />}
            />
          ))}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/user" element={<UserPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireNonViewer>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/scoreboard-debug"
            element={
              <ProtectedRoute>
                <AdminScoreboardDebugPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/access"
            element={
              <ProtectedRoute allowedPermissions={ADMIN_ACCESS_PERMISSIONS}>
                <AdminAccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/event-access"
            element={
              <ProtectedRoute allowedPermissions={EVENT_ACCESS_PERMISSIONS}>
                <EventAccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/signup-management"
            element={
              <ProtectedRoute allowedPermissions={SIGNUP_MANAGEMENT_ACCESS_PERMISSIONS}>
                <SignupManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spirit-scores"
            element={
              <ProtectedRoute allowedPermissions={SPIRIT_SCORES_ACCESS_PERMISSIONS}>
                <SpiritScoresPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tournament-director"
            element={
              <ProtectedRoute allowedPermissions={TOURNAMENT_DIRECTOR_ACCESS_PERMISSIONS}>
                <TournamentDirectorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/media"
            element={
              <ProtectedRoute allowedPermissions={MEDIA_ACCESS_PERMISSIONS}>
                <MediaAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/event-setup"
            element={
              <ProtectedRoute allowedPermissions={EVENT_SETUP_ACCESS_PERMISSIONS}>
                <EventSetupWizardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/captain"
            element={
              <ProtectedRoute allowedPermissions={CAPTAIN_ACCESS_PERMISSIONS}>
                <CaptainPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sys-admin"
            element={
              <ProtectedRoute allowedPermissions={SYS_ADMIN_ACCESS_PERMISSIONS}>
                <SysAdminPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route
          path="/score-keeper"
          element={
            <ProtectedRoute allowedPermissions={SCOREKEEPER_ACCESS_PERMISSIONS}>
              <Suspense fallback={routeFallback}>
                <ScoreKeeperPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/score-keeper-5v5"
          element={
            <ProtectedRoute allowedPermissions={SCOREKEEPER_ACCESS_PERMISSIONS}>
              <Suspense fallback={routeFallback}>
                <ScoreKeeper5v5Page />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/scrimmage"
          element={
            <Suspense fallback={routeFallback}>
              <ScrimmagePage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
