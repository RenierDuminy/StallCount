import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getRoleCatalog } from "../services/userService";
import {
  normalisePermissionList,
  normaliseRoleList,
  userHasAnyPermission,
  userHasAnyRole,
} from "../utils/accessControl";

export default function ProtectedRoute({
  children,
  allowedRoles,
  allowedPermissions,
  requireNonViewer = false,
}) {
  const { session, loading, roles, rolesLoading } = useAuth();
  const [roleCatalog, setRoleCatalog] = useState(null);
  const [roleCatalogLoading, setRoleCatalogLoading] = useState(false);

  const shouldCheckRoles = Array.isArray(allowedRoles) ? allowedRoles.length > 0 : Boolean(allowedRoles);
  const shouldCheckPermissions = Array.isArray(allowedPermissions)
    ? allowedPermissions.length > 0
    : Boolean(allowedPermissions);
  const shouldCheckNonViewer = Boolean(requireNonViewer);
  const requiredRoles = shouldCheckRoles ? normaliseRoleList(allowedRoles) : [];
  const requiredPermissions = shouldCheckPermissions
    ? normalisePermissionList(allowedPermissions)
    : [];

  const formatAccessLabel = (value) =>
    String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const accessRequirements = [
    requiredRoles.length > 0
      ? `Roles: ${requiredRoles.map(formatAccessLabel).join(", ")}`
      : null,
    requiredPermissions.length > 0
      ? `Permissions: ${requiredPermissions.map(formatAccessLabel).join(", ")}`
      : null,
    shouldCheckNonViewer ? "Role: Non-viewer (any elevated role)" : null,
  ].filter(Boolean);

  useEffect(() => {
    let isActive = true;

    if (!shouldCheckPermissions || !session) {
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
  }, [session, shouldCheckPermissions]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;

  if (shouldCheckRoles || shouldCheckPermissions || shouldCheckNonViewer) {
    if (!Array.isArray(roles) || rolesLoading || (shouldCheckPermissions && roleCatalogLoading)) {
      return <div className="p-8 text-gray-500">Checking access...</div>;
    }

    const isAdmin = userHasAnyRole(session.user, ["admin"], roles);
    if (isAdmin) {
      return children;
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
          {accessRequirements.length > 0 ? (
            <div className="mt-4 text-xs text-ink-muted">
              <p className="font-semibold text-ink">Required access levels</p>
              <ul className="mt-2 space-y-1">
                {accessRequirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }
  }

  return children;
}
