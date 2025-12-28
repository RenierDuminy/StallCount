import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";

import HomePage from "./pages/HomePage";
import AdminPage from "./pages/AdminPage";
import AdminScoreboardDebugPage from "./pages/AdminScoreboardDebugPage";
import AdminAccessPage from "./pages/AdminAccessPage";
import ScoreKeeperPage from "./pages/ScoreKeeperPage";
import CaptainPage from "./pages/CaptainPage";
import SysAdminPage from "./pages/SysAdminPage";
import Teams from "./pages/Teams";
import Players from "./pages/PlayersPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import MatchesPage from "./pages/MatchesPage";
import EventsPage from "./pages/EventsPage";
import DRTestingPage from "./pages/DR-testing";
import DROwLeague26Page from "./pages/DR-OWleague26";
import EventSetupWizardPage from "./pages/EventSetupWizard";
import DRRL26Page from "./pages/DR-RL26";
import TeamProfilePage from "./pages/TeamProfile";
import SpiritScoresPage from "./pages/SpiritScoresPage";
import UserPage from "./pages/UserPage";
import NotificationsPage from "./pages/NotificationsPage";
import AppLayout from "./components/AppLayout";
import TournamentDirectorPage from "./pages/TournamentDirectorPage";
import MediaAdminPage from "./pages/MediaAdminPage";
import { ADMIN_TOOL_ACCESS_ROLES } from "./utils/accessControl";

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
          <Route path="/events/dr-testing" element={<DRTestingPage />} />
          <Route path="/events/dr-owleague26" element={<DROwLeague26Page />} />
          <Route path="/events/dr-rl26" element={<DRRL26Page />} />
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
              <ScoreKeeperPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
