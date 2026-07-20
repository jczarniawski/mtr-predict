"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body.error === "string" && body.error) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body?.code);
  }
  return body as T;
}

/**
 * Fetch JSON on mount and re-fetch on an interval while the tab is visible.
 * Pass url = null to pause. Refetches keep stale data on screen.
 */
export function usePolledJson<T>(url: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async (silent = false) => {
    const target = urlRef.current;
    if (!target) return;
    if (!silent) setLoading(true);
    try {
      const json = await fetchJson<T>(target);
      if (urlRef.current === target) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (urlRef.current === target) setError((e as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void load();
    if (intervalMs > 0) {
      const id = setInterval(() => {
        if (document.visibilityState === "visible") void load(true);
      }, intervalMs);
      return () => clearInterval(id);
    }
  }, [url, intervalMs, load]);

  const refresh = useCallback(() => load(true), [load]);
  return { data, error, loading, refresh };
}
