"use client";

// Who is signed in, shared by every social page. One fetch per page load.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface Me {
  handle: string;
  name: string;
  avatarUrl: string | null;
  premium: boolean;
}
interface MeState {
  me: Me | null;
  loading: boolean;
  linked: string[];
  googleClientId: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<MeState>({ me: null, loading: true, linked: [], googleClientId: null, refresh: async () => {} });

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<MeState, "refresh">>({ me: null, loading: true, linked: [], googleClientId: null });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      const b = await r.json();
      setState({
        me: b.user,
        loading: false,
        linked: b.linked ?? [],
        googleClientId: b.googleClientId ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useMe = () => useContext(Ctx);
