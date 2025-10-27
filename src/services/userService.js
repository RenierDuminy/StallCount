import { supabase } from "./supabaseClient";

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (error) console.error(error);
  return data;
}
