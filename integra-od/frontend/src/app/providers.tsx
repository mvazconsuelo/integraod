import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { api, ApiError, getToken, setToken } from "@/lib/api";
import { writeBrand } from "@/lib/brand-cache";
import { setClinicTimeZone } from "@/lib/time-zone";
import type { Settings } from "@/types";

const SettingsContext = createContext<{ settings: Settings | null; reload: () => Promise<void> }>({ settings: null, reload: async () => {} });
export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const reload = useCallback(async () => {
    try { const s = await api<Settings>("/settings"); setClinicTimeZone(s.time_zone); writeBrand({ name: s.name, logo_url: s.logo_url }); setSettings(s); } catch { /* el shell muestra el error si hace falta */ }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return <SettingsContext.Provider value={{ settings, reload }}>{children}</SettingsContext.Provider>;
}

/** Pide la clave de acceso una vez por sesión del navegador. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(Boolean(getToken()));

  useEffect(() => {
    const expire = () => setAuthed(false);
    window.addEventListener("auth-expired", expire);
    return () => window.removeEventListener("auth-expired", expire);
  }, []);

  if (authed) return <>{children}</>;

  /** Devuelve el problema para mostrarlo, o null si la clave entró. */
  const signIn = async (key: string) => {
    setToken(key);
    try {
      await api("/session");
      setAuthed(true);
      return null;
    } catch (e) {
      setToken("");
      if (e instanceof ApiError && (e.status === 429 || e.status === 0)) return e.message;
      return "La clave no es correcta. Revisala e intentá de nuevo.";
    }
  };

  return <LoginScreen onSubmit={signIn} />;
}
