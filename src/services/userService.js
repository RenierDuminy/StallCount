import { supabase } from "./supabaseClient";

export async function getCurrentUser() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("[getCurrentUser] Unable to fetch auth user:", authError);
    return null;
  }

  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getCurrentUser] Falling back to auth profile:", error);
  }

  if (data) {
    return { ...data, email: user.email };
  }

  return {
    id: user.id,
    full_name: user.user_metadata?.full_name || "",
    role: user.user_metadata?.role || "",
    email: user.email,
  };
}
