import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setSupabaseAuthState, supabase } from "../services/supabaseClient";
import { getUserAccessRoleAssignments } from "../services/userService";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState(null);

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

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        roles,
        rolesLoading,
        rolesError,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
