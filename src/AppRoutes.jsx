import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";

import HomePage from "./pages/HomePage";
import AdminPage from "./pages/AdminPage";
import ScoreKeeperPage from "./pages/ScoreKeeperPage";
import CaptainPage from "./pages/CaptainPage";
import SysAdminPage from "./pages/SysAdminPage";
import Teams from "./pages/Teams";
import Players from "./pages/PlayersPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import MatchesPage from "./pages/MatchesPage";
import DivisionsPage from "./pages/DivisionsPage";
import DivisionResultsPage from "./pages/DivisionResultsPage";
import TeamProfilePage from "./pages/TeamProfile";
import SpiritScoresPage from "./pages/SpiritScoresPage";
import UserPage from "./pages/UserPage";
import NotificationsPage from "./pages/NotificationsPage";
import AppLayout from "./components/AppLayout";
import TournamentDirectorPage from "./pages/TournamentDirectorPage";
import MediaAdminPage from "./pages/MediaAdminPage";

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
          <Route path="/divisions" element={<DivisionsPage />} />
          <Route path="/division-results" element={<DivisionResultsPage />} />
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
              <ProtectedRoute>
                <AdminPage />
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
