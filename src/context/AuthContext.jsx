import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function initialiseSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          console.error("[AuthProvider] Failed to fetch session:", error);
        }
        setSession(data?.session ?? null);
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

    // listen for login/logout
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
