"use client";

import { useState, useEffect, useCallback } from "react";

interface UseFetchOptions {
  refreshInterval?: number;
}

export function useFetch<T>(url: string, options?: UseFetchOptions) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fetch failed");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void fetchData();
    if (options?.refreshInterval) {
      const interval = setInterval(() => void fetchData(), options.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, options?.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}
