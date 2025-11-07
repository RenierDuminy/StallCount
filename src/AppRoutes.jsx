import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";

import TestMatches from "./pages/TestMatches";
import RealtimeTest from "./pages/RealtimeTest";
import HomePage from "./pages/HomePage";
import AdminPage from "./pages/AdminPage";
import ScoreKeeperPage from "./pages/ScoreKeeperPage";
import CaptainPage from "./pages/CaptainPage";
import SysAdminPage from "./pages/SysAdminPage";
import Players from "./pages/Players";
import Teams from "./pages/Teams";


export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/test-matches" element={<TestMatches />} />
        <Route path="/realtime-test" element={<RealtimeTest />} />
        <Route path="/players" element={<Players />} />
        <Route path="/teams" element={<Teams />} />
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
      </Routes>
    </BrowserRouter>
  );
}
