import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function TestMatches() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    async function loadMatches() {
      const { data, error } = await supabase.from("matches").select("*");
      if (error) console.error("Error loading matches:", error);
      else setMatches(data);
    }
    loadMatches();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Matches (Test)</h1>
      <pre className="bg-gray-100 p-4 rounded">
        {JSON.stringify(matches, null, 2)}
      </pre>
    </div>
  );
}
