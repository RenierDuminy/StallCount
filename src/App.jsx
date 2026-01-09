import AppRoutes from "./AppRoutes";
import { AuthProvider } from "./context/AuthContext";
import ConnectionBanner from "./components/ConnectionBanner";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <AuthProvider>
      <ConnectionBanner />
      <AppRoutes />
      <SpeedInsights />
      <Analytics />
    </AuthProvider>
  );
}
