import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

import AppLayout from "./components/AppLayout";
import { ADMIN_TOOL_ACCESS_ROLES } from "./utils/accessControl";
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
const CaptainPage = lazy(() => import("./pages/CaptainPage"));
const SysAdminPage = lazy(() => import("./pages/SysAdminPage"));
const UserPage = lazy(() => import("./pages/UserPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminScoreboardDebugPage = lazy(() => import("./pages/AdminScoreboardDebugPage"));
const AdminAccessPage = lazy(() => import("./pages/AdminAccessPage"));
const SpiritScoresPage = lazy(() => import("./pages/SpiritScoresPage"));
const TournamentDirectorPage = lazy(() => import("./pages/TournamentDirectorPage"));
const MediaAdminPage = lazy(() => import("./pages/MediaAdminPage"));
const EventRostersPageLazy = lazy(() => import("./pages/EventRostersPage"));

const routeFallback = (
  <div className="sc-shell flex min-h-[40vh] items-center justify-center text-sm text-[var(--sc-ink-muted)]">
    Loading...
  </div>
);

export default function AppRoutes() {
  return (
    <BrowserRouter>
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
              <ProtectedRoute allowedRoles={ADMIN_TOOL_ACCESS_ROLES}>
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
              <ProtectedRoute>
                <AdminAccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spirit-scores"
            element={
              <ProtectedRoute>
                <SpiritScoresPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tournament-director"
            element={
              <ProtectedRoute>
                <TournamentDirectorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/media"
            element={
              <ProtectedRoute>
                <MediaAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/event-setup"
            element={
              <ProtectedRoute>
                <EventSetupWizardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/captain"
            element={
              <ProtectedRoute>
                <CaptainPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sys-admin"
            element={
              <ProtectedRoute>
                <SysAdminPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route
          path="/score-keeper"
          element={
            <ProtectedRoute>
              <Suspense fallback={routeFallback}>
                <ScoreKeeperPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
