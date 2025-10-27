import { syncCachedUpdates } from "../services/realtimeService";

useEffect(() => {
  window.addEventListener("online", syncCachedUpdates);
  return () => window.removeEventListener("online", syncCachedUpdates);
}, []);
