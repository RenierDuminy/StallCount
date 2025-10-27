import { useEffect, useState } from "react";
import { getCurrentUser } from "../services/userService";
import { supabase } from "../services/supabaseClient";

export default function Dashboard() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    getCurrentUser().then(setProfile);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!profile) return <p className="p-8 text-gray-500">Loading profile...</p>;

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-3xl font-bold mb-2">StallCount Dashboard</h1>
      <p className="text-gray-600 mb-4">
        Logged in as <strong>{profile.full_name || profile.email}</strong> ({profile.role})
      </p>
      <button
        onClick={handleLogout}
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
      >
        Log Out
      </button>
    </div>
  );
}
