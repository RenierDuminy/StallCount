import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getRoleCatalog } from "../services/userService";
import { userHasAnyPermission, userHasAnyRole } from "../utils/accessControl";

export default function ProtectedRoute({
  children,
  allowedRoles,
  allowedPermissions,
  requireNonViewer = false,
}) {
  const { session, loading, roles, rolesLoading } = useAuth();
  const [roleCatalog, setRoleCatalog] = useState(null);
  const [roleCatalogLoading, setRoleCatalogLoading] = useState(false);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;

  const shouldCheckRoles = Array.isArray(allowedRoles) ? allowedRoles.length > 0 : Boolean(allowedRoles);
  const shouldCheckPermissions = Array.isArray(allowedPermissions)
    ? allowedPermissions.length > 0
    : Boolean(allowedPermissions);
  const shouldCheckNonViewer = Boolean(requireNonViewer);

  useEffect(() => {
    let isActive = true;

    if (!shouldCheckPermissions) {
      setRoleCatalog(null);
      setRoleCatalogLoading(false);
      return () => {
        isActive = false;
      };
    }

    setRoleCatalogLoading(true);
    getRoleCatalog()
      .then((catalog) => {
        if (isActive) {
          setRoleCatalog(Array.isArray(catalog) ? catalog : []);
        }
      })
      .catch((error) => {
        if (isActive) {
          console.error("[ProtectedRoute] Unable to load role catalog:", error);
          setRoleCatalog([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setRoleCatalogLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [shouldCheckPermissions]);

  if (shouldCheckRoles || shouldCheckPermissions || shouldCheckNonViewer) {
    if (!Array.isArray(roles) || rolesLoading || (shouldCheckPermissions && roleCatalogLoading)) {
      return <div className="p-8 text-gray-500">Checking access...</div>;
    }

    const hasNonViewerRole = roles.some(
      (role) => role?.roleId !== null && role?.roleId !== undefined && role?.roleId !== 14,
    );
    const hasAllowedRole = shouldCheckRoles
      ? userHasAnyRole(session.user, allowedRoles, roles)
      : true;
    const hasAllowedPermission = shouldCheckPermissions
      ? userHasAnyPermission(session.user, allowedPermissions, roles, roleCatalog)
      : true;

    if (
      !hasAllowedRole ||
      !hasAllowedPermission ||
      (shouldCheckNonViewer && !hasNonViewerRole)
    ) {
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
