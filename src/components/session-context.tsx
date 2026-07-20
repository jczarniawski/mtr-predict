"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePolledJson } from "@/components/fetcher";
import type { AccountView } from "@/lib/portfolio";

export interface MeResponse {
  mode: "live" | "mock";
  depositsEnabled: boolean;
  account: AccountView | null;
}

interface SessionContextValue {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue>({
  me: null,
  loading: true,
  refresh: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, loading, refresh } = usePolledJson<MeResponse>("/api/me", 30_000);
  return (
    <SessionContext.Provider value={{ me: data, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
