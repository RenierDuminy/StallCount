import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { subscribeToMatchUpdates } from "../services/realtimeService";

export default function RealtimeTest() {
  const [matches, setMatches] = useState([]);

  // Load existing matches
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("matches").select("*");
      setMatches(data || []);
    }
    load();

    // Subscribe to changes
    const unsubscribe = subscribeToMatchUpdates((type, row) => {
      console.log("Event:", type, row);
      if (type === "UPDATE") {
        setMatches((prev) =>
          prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
        );
      } else if (type === "INSERT") {
        setMatches((prev) => [...prev, row]);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Realtime Match Updates</h1>
      <pre className="bg-gray-100 p-4 rounded text-sm">
        {JSON.stringify(matches, null, 2)}
      </pre>
    </div>
  );
}
