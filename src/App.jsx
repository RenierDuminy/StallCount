import AppRoutes from "./AppRoutes";
import { AuthProvider } from "./context/AuthContext";
import ConnectionBanner from "./components/ConnectionBanner";

export default function App() {
  return (
    <AuthProvider>
      <ConnectionBanner />
      <AppRoutes />
    </AuthProvider>
  );
}
