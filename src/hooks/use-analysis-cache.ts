import { useCallback, useEffect, useState } from "react";

/**
 * Caches an analysis result in sessionStorage keyed by analysis type + username.
 * Switching tabs no longer loses the result; switching users loads a different
 * cached value (or null) so cross-collection results never leak.
 */
export function useAnalysisCache<T>(type: string, username: string | undefined) {
  const [cached, setCachedState] = useState<T | null>(null);
  const key = username ? `linernote-analysis-${type}-${username}` : null;

  useEffect(() => {
    if (!key) {
      setCachedState(null);
      return;
    }
    try {
      const stored = sessionStorage.getItem(key);
      setCachedState(stored ? (JSON.parse(stored) as T) : null);
    } catch {
      setCachedState(null);
    }
  }, [key]);

  const setCached = useCallback(
    (value: T | null) => {
      setCachedState(value);
      if (!key) return;
      try {
        if (value === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn("Failed to cache analysis result:", e);
      }
    },
    [key]
  );

  return { cached, setCached };
}
