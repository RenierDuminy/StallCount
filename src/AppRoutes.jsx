import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";

import HomePage from "./pages/HomePage";
import AdminPage from "./pages/AdminPage";
import ScoreKeeperPage from "./pages/ScoreKeeperPage";
import CaptainPage from "./pages/CaptainPage";
import SysAdminPage from "./pages/SysAdminPage";
import Players from "./pages/Players";
import Teams from "./pages/Teams";
import MatchesPage from "./pages/MatchesPage";
import TeamProfilePage from "./pages/TeamProfile";
import SpiritScoresPage from "./pages/SpiritScoresPage";
import UserPage from "./pages/UserPage";
import AppLayout from "./components/AppLayout";


export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/players" element={<Players />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:teamId" element={<TeamProfilePage />} />
          <Route path="/matches" element={<MatchesPage />} />
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
          path="/score-keeper"
          element={
            <ProtectedRoute>
              <ScoreKeeperPage />
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
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
