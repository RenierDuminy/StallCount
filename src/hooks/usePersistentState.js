import { useEffect, useState } from "react";

function resolveInitialValue(initialValue) {
  return typeof initialValue === "function" ? initialValue() : initialValue;
}

export default function usePersistentState(storageKey, initialValue) {
  const [state, setState] = useState(() => {
    const fallback = resolveInitialValue(initialValue);

    if (typeof window === "undefined") {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore storage quota and serialization issues; state still works in memory.
    }
  }, [state, storageKey]);

  return [state, setState];
}
