import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setSupabaseAuthState, supabase } from "../services/supabaseClient";
import { getRoleCatalog, getUserAccessRoleAssignments } from "../services/userService";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState(null);
  // The role catalog (roles + the permissions each grants) is global and rarely
  // changes, so it is fetched once here instead of by every page that needs it
  // to resolve access. `null` means "not loaded yet", matching `roles`.
  const [roleCatalog, setRoleCatalog] = useState(null);
  const [roleCatalogLoading, setRoleCatalogLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initialiseSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          console.error("[AuthProvider] Failed to fetch session:", error);
        }
        const nextSession = data?.session ?? null;
        setSession(nextSession);
        setSupabaseAuthState(Boolean(nextSession));
      } catch (err) {
        if (isMounted) {
          console.error("[AuthProvider] Unexpected session error:", err);
          setSession(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initialiseSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setSupabaseAuthState(Boolean(nextSession));
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshRoles = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setRoles([]);
      setRolesError(null);
      setRolesLoading(false);
      return [];
    }

    setRolesLoading(true);
    setRolesError(null);
    setRoles(null);

    try {
      const assignments = await getUserAccessRoleAssignments(userId);
      setRoles(assignments);
      return assignments;
    } catch (error) {
      console.error("[AuthProvider] Unable to refresh role assignments:", error);
      const message = error instanceof Error ? error.message : "Unable to load roles.";
      setRoles([]);
      setRolesError(message);
      throw error;
    } finally {
      setRolesLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    let isSubscribed = true;
    const userId = session?.user?.id;

    if (!userId) {
      setRoles([]);
      setRolesLoading(false);
      setRolesError(null);
      return undefined;
    }

    setRoles(null);
    setRolesLoading(true);
    setRolesError(null);

    getUserAccessRoleAssignments(userId)
      .then((assignments) => {
        if (!isSubscribed) return;
        setRoles(assignments);
      })
      .catch((error) => {
        if (!isSubscribed) return;
        console.error("[AuthProvider] Failed to load role assignments:", error);
        setRoles([]);
        setRolesError(error instanceof Error ? error.message : "Unable to load roles.");
      })
      .finally(() => {
        if (!isSubscribed) return;
        setRolesLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [session?.user?.id]);

  // Signed-out visitors never need the catalog: every permission check that uses
  // it is behind a session. Keyed on the user id (not the session object) so a
  // token refresh doesn't trigger a refetch.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    let isSubscribed = true;

    if (!userId) {
      setRoleCatalog(null);
      setRoleCatalogLoading(false);
      return undefined;
    }

    setRoleCatalogLoading(true);
    getRoleCatalog()
      .then((catalog) => {
        if (!isSubscribed) return;
        setRoleCatalog(Array.isArray(catalog) ? catalog : []);
      })
      .catch((error) => {
        if (!isSubscribed) return;
        console.error("[AuthProvider] Failed to load role catalog:", error);
        setRoleCatalog([]);
      })
      .finally(() => {
        if (!isSubscribed) return;
        setRoleCatalogLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [userId]);

  const value = useMemo(
    () => ({
      session,
      loading,
      roles,
      rolesLoading,
      rolesError,
      refreshRoles,
      roleCatalog,
      roleCatalogLoading,
    }),
    [
      session,
      loading,
      roles,
      rolesLoading,
      rolesError,
      refreshRoles,
      roleCatalog,
      roleCatalogLoading,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
