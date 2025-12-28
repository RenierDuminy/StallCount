import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { userHasAnyRole } from "../utils/accessControl";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { session, loading, roles, rolesLoading } = useAuth();

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;

  const shouldCheckRoles = Array.isArray(allowedRoles) ? allowedRoles.length > 0 : Boolean(allowedRoles);
  if (shouldCheckRoles) {
    if (!Array.isArray(roles) || rolesLoading) {
      return <div className="p-8 text-gray-500">Checking access...</div>;
    }

    if (!userHasAnyRole(session.user, allowedRoles, roles)) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-16 text-center text-ink">
          <p className="text-2xl font-semibold text-ink">Access restricted</p>
          <p className="mt-3 text-sm text-ink-muted">
            You need elevated admin permissions to view this area. Contact operations if you require access.
          </p>
        </div>
      );
    }
  }

  return children;
}
