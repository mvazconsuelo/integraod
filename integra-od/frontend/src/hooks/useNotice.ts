import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Deja un aviso corto arriba ("Registraste $30.000…"). El AppShell lo muestra unos segundos. */
export function useNotice() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((text: string) => navigate(`${location.pathname}${location.search}`, { replace: true, state: { notice: text } }), [navigate, location.pathname, location.search]);
}
