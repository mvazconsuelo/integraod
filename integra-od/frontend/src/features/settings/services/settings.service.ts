import { api, getToken } from "@/lib/api";
import type { Settings } from "@/types";

export type ProfileInput = Omit<Settings, "payments_online" | "mp_connected" | "mp_mock" | "logo_url">;

export const saveSettings = (s: ProfileInput) => api<Settings>("/settings", { method: "PUT", body: s });
export const mpConnectUrl = () => api<{ url: string }>("/mercadopago/connect");
export const mpDisconnect = () => api("/mercadopago/disconnect", { method: "POST", body: {} });

/** El logo se sube como archivo (cuerpo = la imagen) y se guarda al instante; no viaja con "Guardar cambios". */
export async function uploadLogo(file: File): Promise<Settings> {
  const res = await fetch("/api/settings/logo", { method: "PUT", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": file.type }, body: file, cache: "no-store" });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No pudimos subir el logo.");
  return res.json();
}
export const removeLogo = () => api<Settings>("/settings/logo", { method: "DELETE" });
